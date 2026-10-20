import crypto from 'node:crypto';
import { fail } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { Resend } from 'resend';
import type { Actions } from './$types';
import { BodyReadError, readBoundedBody, withDeadline } from '$lib/server/http/body';
import { createLocalAdmission } from '$lib/server/http/local-admission';

const MAX_REQUEST_BYTES = 64 * 1024;
const BODY_TIMEOUT_MS = 10000;
const MAIL_TIMEOUT_MS = 15000;
const NAME_MAX_LENGTH = 120;
const EMAIL_MAX_LENGTH = 254;
const MESSAGE_MIN_LENGTH = 10;
const MESSAGE_MAX_LENGTH = 5000;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const consumeRateLimit = createLocalAdmission({
	attempts: 3,
	globalAttempts: 30,
	windowMs: 15 * 60 * 1000,
	concurrency: 3,
	maxKeys: 2048
});

type ContactValues = {
	name: string;
	email: string;
	message: string;
};

type ContactErrors = Partial<Record<keyof ContactValues | 'form', string>>;

const emptyValues = (): ContactValues => ({ name: '', email: '', message: '' });

const fieldValue = (formData: FormData, field: string) => {
	const value = formData.get(field);
	return typeof value === 'string' ? value.trim() : '';
};

const validate = (values: ContactValues) => {
	const errors: ContactErrors = {};

	if (!values.name) {
		errors.name = 'Please enter your name.';
	} else if (values.name.length > NAME_MAX_LENGTH) {
		errors.name = `Name must be ${NAME_MAX_LENGTH} characters or fewer.`;
	}

	if (!values.email) {
		errors.email = 'Please enter your email address.';
	} else if (values.email.length > EMAIL_MAX_LENGTH || !EMAIL_PATTERN.test(values.email)) {
		errors.email = 'Please enter a valid email address.';
	}

	if (!values.message) {
		errors.message = 'Please enter a message.';
	} else if (values.message.length < MESSAGE_MIN_LENGTH) {
		errors.message = `Message must be at least ${MESSAGE_MIN_LENGTH} characters.`;
	} else if (values.message.length > MESSAGE_MAX_LENGTH) {
		errors.message = `Message must be ${MESSAGE_MAX_LENGTH} characters or fewer.`;
	}

	return errors;
};

const clientKey = (getClientAddress: () => string) => {
	try {
		return crypto.createHash('sha256').update(getClientAddress()).digest('base64url');
	} catch {
		// Fail conservatively with one shared bucket when the adapter has no address.
		return 'unknown';
	}
};

const formFailure = (status: number, values: ContactValues, message: string) =>
	fail(status, {
		values,
		errors: { form: message } satisfies ContactErrors
	});

export const actions: Actions = {
	default: async ({ request, url, getClientAddress, setHeaders }) => {
		if (request.headers.get('origin') !== url.origin) {
			return formFailure(403, emptyValues(), 'Please submit this form from the contact page.');
		}

		let formData: FormData;
		try {
			const bytes = await readBoundedBody(
				request,
				MAX_REQUEST_BYTES,
				BODY_TIMEOUT_MS,
				request.signal
			);
			formData = await new Response(bytes, { headers: request.headers }).formData();
		} catch (error) {
			if (error instanceof BodyReadError) {
				return formFailure(
					error.kind === 'too-large' ? 413 : 408,
					emptyValues(),
					error.kind === 'too-large'
						? 'Your message is too large to submit.'
						: 'Your form took too long to submit. Please try again.'
				);
			}
			return formFailure(
				400,
				emptyValues(),
				'The submitted form could not be read. Please try again.'
			);
		}

		const values: ContactValues = {
			name: fieldValue(formData, 'name'),
			email: fieldValue(formData, 'email'),
			message: fieldValue(formData, 'message')
		};
		const website = fieldValue(formData, 'website');

		if (website) {
			return formFailure(400, values, 'Your message could not be sent. Please try again.');
		}

		const errors = validate(values);

		if (Object.keys(errors).length > 0) {
			return fail(400, { values, errors });
		}

		const rateLimit = consumeRateLimit(clientKey(getClientAddress));
		if (!rateLimit.allowed) {
			setHeaders({ 'retry-after': String(rateLimit.retryAfterSeconds) });
			return formFailure(
				429,
				values,
				'Too many messages have been submitted from this connection. Please try again later.'
			);
		}

		try {
			const resendApiKey = env.RESEND_API_KEY;
			const toEmail = env.CONTACT_TO_EMAIL || 'contact@suvroghosh.in';
			const fromEmail = env.CONTACT_FROM_EMAIL || 'noreply@suvroghosh.in';

			if (!resendApiKey) {
				return formFailure(500, values, 'Contact form email is not configured yet.');
			}

			const timestamp = new Date().toISOString();
			try {
				const resend = new Resend(resendApiKey);
				const result = await withDeadline((signal) => {
					// The installed SDK forwards request options to fetch, including AbortSignal.
					const options = { headers: {}, signal };
					return resend.emails.send(
						{
							from: `Website Contact <${fromEmail}>`,
							to: toEmail,
							replyTo: values.email,
							subject: 'New message from suvroghosh.in contact form',
							text: [
								'New contact form submission',
								'',
								`Name: ${values.name}`,
								`Email: ${values.email}`,
								`Timestamp: ${timestamp}`,
								`Source: suvroghosh.in contact page (${url.href})`,
								'',
								'Message:',
								values.message
							].join('\n')
						},
						options
					);
				}, MAIL_TIMEOUT_MS);

				if (result.error) {
					console.error('Contact email delivery was rejected:', result.error.message);
					return formFailure(500, values, 'Your message could not be sent. Please try again.');
				}
			} catch (error) {
				console.error(
					'Contact email delivery failed:',
					error instanceof Error ? error.message : 'Unknown delivery error'
				);
				return formFailure(500, values, 'Your message could not be sent. Please try again.');
			}

			return {
				success: true,
				values: emptyValues()
			};
		} finally {
			rateLimit.release();
		}
	}
};

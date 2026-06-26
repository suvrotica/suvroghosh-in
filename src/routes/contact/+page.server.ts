import { fail } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { Resend } from 'resend';
import type { Actions } from './$types';

const NAME_MAX_LENGTH = 120;
const EMAIL_MAX_LENGTH = 254;
const MESSAGE_MIN_LENGTH = 10;
const MESSAGE_MAX_LENGTH = 5000;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type ContactValues = {
	name: string;
	email: string;
	message: string;
};

type ContactErrors = Partial<Record<keyof ContactValues | 'form', string>>;

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

export const actions: Actions = {
	default: async ({ request, url }) => {
		const formData = await request.formData();
		const values: ContactValues = {
			name: fieldValue(formData, 'name'),
			email: fieldValue(formData, 'email'),
			message: fieldValue(formData, 'message')
		};
		const website = fieldValue(formData, 'website');

		if (website) {
			return fail(400, {
				values,
				errors: {
					form: 'Your message could not be sent. Please try again.'
				} satisfies ContactErrors
			});
		}

		const errors = validate(values);

		if (Object.keys(errors).length > 0) {
			return fail(400, { values, errors });
		}

		const resendApiKey = env.RESEND_API_KEY;
		const toEmail = env.CONTACT_TO_EMAIL || 'contact@suvroghosh.in';
		const fromEmail = env.CONTACT_FROM_EMAIL || 'noreply@suvroghosh.in';

		if (!resendApiKey) {
			return fail(500, {
				values,
				errors: { form: 'Contact form email is not configured yet.' } satisfies ContactErrors
			});
		}

		const timestamp = new Date().toISOString();
		const resend = new Resend(resendApiKey);
		const result = await resend.emails.send({
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
		});

		if (result.error) {
			return fail(500, {
				values,
				errors: {
					form: 'Your message could not be sent. Please try again.'
				} satisfies ContactErrors
			});
		}

		return {
			success: true,
			values: {
				name: '',
				email: '',
				message: ''
			}
		};
	}
};

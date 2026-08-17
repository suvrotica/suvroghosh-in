import type { QuestionDefinition, QuestionId } from '../core/question-types';

const option = <const O extends string>(id: O, label: string) => ({ id, label }) as const;

export const QUESTION_REGISTRY = {
	country: {
		id: 'country',
		label: 'Country',
		shortLabel: 'Country',
		permittedUse: 'unused-demographic',
		defaultOptionId: 'india',
		optional: true,
		options: [
			option('india', 'India'),
			option('bangladesh', 'Bangladesh'),
			option('bhutan', 'Bhutan'),
			option('nepal', 'Nepal'),
			option('pakistan', 'Pakistan'),
			option('sri-lanka', 'Sri Lanka'),
			option('united-kingdom', 'United Kingdom'),
			option('united-states', 'United States'),
			option('elsewhere', 'Elsewhere'),
			option('prefer-not-to-say', 'Prefer not to say')
		]
	},
	city_context: {
		id: 'city_context',
		label: 'City or place context',
		shortLabel: 'Place',
		permittedUse: 'unused-demographic',
		defaultOptionId: 'kolkata',
		optional: true,
		options: [
			option('kolkata', 'Kolkata'),
			option('delhi', 'Delhi'),
			option('mumbai', 'Mumbai'),
			option('bengaluru', 'Bengaluru'),
			option('chennai', 'Chennai'),
			option('dhaka', 'Dhaka'),
			option('london', 'London'),
			option('new-york', 'New York'),
			option('another-city', 'Another city'),
			option('town', 'Town'),
			option('rural-area', 'Rural area'),
			option('moves-between-places', 'Moves between places'),
			option('prefer-not-to-say', 'Prefer not to say')
		]
	},
	language: {
		id: 'language',
		label: 'Language(s) used most',
		shortLabel: 'Language',
		permittedUse: 'presentation-only',
		defaultOptionId: 'bengali-english',
		optional: true,
		options: [
			option('bengali-english', 'Bengali + English'),
			option('bengali', 'Bengali'),
			option('english', 'English'),
			option('hindi-english', 'Hindi + English'),
			option('another-language-mix', 'Another language or mix'),
			option('prefer-not-to-say', 'Prefer not to say')
		]
	},
	age_band: {
		id: 'age_band',
		label: 'Age band',
		shortLabel: 'Age',
		permittedUse: 'unused-demographic',
		defaultOptionId: 'prefer-not-to-say',
		optional: true,
		options: [
			option('under-18', 'Under 18'),
			option('18-24', '18–24'),
			option('25-34', '25–34'),
			option('35-44', '35–44'),
			option('45-54', '45–54'),
			option('55-64', '55–64'),
			option('65-plus', '65+'),
			option('prefer-not-to-say', 'Prefer not to say')
		]
	},
	gender: {
		id: 'gender',
		label: 'Gender',
		shortLabel: 'Gender',
		permittedUse: 'unused-demographic',
		defaultOptionId: 'prefer-not-to-say',
		optional: true,
		options: [
			option('woman', 'Woman'),
			option('man', 'Man'),
			option('non-binary', 'Non-binary'),
			option('another-neutral', 'Another identity / use neutral wording'),
			option('prefer-not-to-say', 'Prefer not to say')
		]
	},
	self_reported_device: {
		id: 'self_reported_device',
		label: 'Main device, by self-report',
		shortLabel: 'Device',
		permittedUse: 'unused-decoy',
		defaultOptionId: 'prefer-not-to-say',
		optional: true,
		options: [
			option('phone', 'Phone'),
			option('tablet', 'Tablet'),
			option('laptop', 'Laptop'),
			option('desktop', 'Desktop'),
			option('mixed', 'Mixed'),
			option('prefer-not-to-say', 'Prefer not to say')
		]
	},
	reading_time: {
		id: 'reading_time',
		label: 'Usual reading time',
		shortLabel: 'Reading time',
		permittedUse: 'unused-decoy',
		defaultOptionId: 'varies',
		optional: true,
		options: [
			option('morning', 'Morning'),
			option('afternoon', 'Afternoon'),
			option('evening', 'Evening'),
			option('late-night', 'Late night'),
			option('varies', 'Varies'),
			option('prefer-not-to-say', 'Prefer not to say')
		]
	},
	reading_medium: {
		id: 'reading_medium',
		label: 'Preferred medium',
		shortLabel: 'Medium',
		permittedUse: 'unused-decoy',
		defaultOptionId: 'no-preference',
		optional: true,
		options: [
			option('text', 'Text'),
			option('audio', 'Audio'),
			option('video', 'Video'),
			option('interactive', 'Interactive'),
			option('mixture', 'A mixture'),
			option('no-preference', 'No preference')
		]
	},
	planning_style: {
		id: 'planning_style',
		label: 'How tightly do you plan?',
		shortLabel: 'Planning style',
		permittedUse: 'direct-echo',
		defaultOptionId: 'depends',
		optional: true,
		options: [
			option('detailed-plan', 'Detailed plan'),
			option('loose-plan', 'Loose plan'),
			option('improvise', 'Improvise'),
			option('depends', 'Depends')
		]
	},
	decision_pace: {
		id: 'decision_pace',
		label: 'How quickly do you tend to decide?',
		shortLabel: 'Decision pace',
		permittedUse: 'direct-echo',
		defaultOptionId: 'depends-on-stakes',
		optional: true,
		options: [
			option('usually-deliberate', 'Usually deliberate'),
			option('usually-quick', 'Usually quick'),
			option('depends-on-stakes', 'Depends on the stakes')
		]
	},
	novelty_preference: {
		id: 'novelty_preference',
		label: 'Which feels more comfortable?',
		shortLabel: 'Familiarity',
		permittedUse: 'direct-echo',
		defaultOptionId: 'mixture',
		optional: true,
		options: [
			option('familiar-things', 'Familiar things'),
			option('new-things', 'New things'),
			option('mixture', 'A mixture')
		]
	},
	social_recovery: {
		id: 'social_recovery',
		label: 'What usually helps you recover your energy?',
		shortLabel: 'Social recovery',
		permittedUse: 'direct-echo',
		defaultOptionId: 'varies',
		optional: true,
		options: [
			option('time-alone', 'Time alone'),
			option('one-to-one', 'One-to-one company'),
			option('small-group', 'A small group'),
			option('varies', 'It varies')
		]
	},
	focus_style: {
		id: 'focus_style',
		label: 'How do you prefer to focus?',
		shortLabel: 'Focus style',
		permittedUse: 'direct-echo',
		defaultOptionId: 'varies',
		optional: true,
		options: [
			option('one-at-a-time', 'One thing at a time'),
			option('several-threads', 'Several threads'),
			option('varies', 'It varies')
		]
	},
	feedback_preference: {
		id: 'feedback_preference',
		label: 'How do you prefer feedback?',
		shortLabel: 'Feedback preference',
		permittedUse: 'direct-echo',
		defaultOptionId: 'depends',
		optional: true,
		options: [
			option('direct', 'Direct'),
			option('gentle', 'Gentle'),
			option('with-context', 'With context'),
			option('depends', 'It depends')
		]
	},
	time_horizon: {
		id: 'time_horizon',
		label: 'What time horizon is most useful right now?',
		shortLabel: 'Time horizon',
		permittedUse: 'direct-echo',
		defaultOptionId: 'varies',
		optional: true,
		options: [
			option('today', 'Today'),
			option('this-week', 'This week'),
			option('this-month', 'This month'),
			option('longer', 'Longer'),
			option('varies', 'It varies')
		]
	},
	pace: {
		id: 'pace',
		label: 'How does your pace usually run?',
		shortLabel: 'Pace',
		permittedUse: 'direct-echo',
		defaultOptionId: 'varies',
		optional: true,
		options: [
			option('steady', 'Steady'),
			option('bursts', 'In bursts'),
			option('varies', 'It varies')
		]
	},
	preferred_shape: {
		id: 'preferred_shape',
		label: 'Preferred shape',
		shortLabel: 'Shape',
		permittedUse: 'unused-decoy',
		defaultOptionId: 'no-preference',
		optional: true,
		options: [
			option('circle', 'Circle'),
			option('triangle', 'Triangle'),
			option('square', 'Square'),
			option('irregular', 'Irregular'),
			option('no-preference', 'No preference')
		]
	},
	preferred_weather: {
		id: 'preferred_weather',
		label: 'Preferred weather',
		shortLabel: 'Weather',
		permittedUse: 'unused-decoy',
		defaultOptionId: 'no-preference',
		optional: true,
		options: [
			option('clear', 'Clear'),
			option('rainy', 'Rainy'),
			option('cool', 'Cool'),
			option('warm', 'Warm'),
			option('changing', 'Changing'),
			option('no-preference', 'No preference')
		]
	}
} as const satisfies { [Q in QuestionId]: QuestionDefinition<Q, string> };

export type QuestionRegistry = typeof QUESTION_REGISTRY;

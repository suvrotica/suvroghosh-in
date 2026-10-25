export const examples = [
	{
		id: 'story',
		label: 'A creative brief',
		text: 'Write a kind bedtime story about a robot gardener for children aged eight. Use a warm tone. Keep it under 500 words. End with a hopeful surprise.'
	},
	{
		id: 'workflow',
		label: 'An order workflow',
		text: 'Customer submits an order. Then the service validates payment. If approved, the warehouse ships the order. If declined, the service notifies the customer.'
	},
	{
		id: 'states',
		label: 'A publishing lifecycle',
		text: 'Draft becomes Reviewed on approval. Reviewed becomes Published on release. Published becomes Archived on withdrawal.'
	},
	{
		id: 'ownership',
		label: 'A domain model',
		text: 'Users can own many projects; each project has one owner. Each project has a title and a description.'
	},
	{
		id: 'database',
		label: 'A physical schema',
		text: 'PostgreSQL: users have UUID id primary key and unique email text. Projects have UUID id primary key, title text, and owner_id UUID references users.id.'
	},
	{
		id: 'sequence',
		label: 'An exchange',
		text: 'Customer sends an order to Shop. Then Shop sends a payment request to Bank. Then Bank replies with approval to Shop. Then Shop sends confirmation to Customer.'
	},
	{
		id: 'usecase',
		label: 'A system and its users',
		text: 'In the library system, a librarian can lend books. A member can renew loans in the library system. A librarian can catalogue books in the library system.'
	},
	{
		id: 'ambiguity',
		label: 'An uncertain brief',
		text: 'Write a surreal story: the moon invoices Tuesday. Alice tells Beth that she should leave. Make it exactly 100 words and no more than 50 words.'
	}
] as const;

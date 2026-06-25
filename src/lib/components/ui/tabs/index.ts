import Root from './tabs.svelte';
import List from './tabs-list.svelte';
import Trigger from './tabs-trigger.svelte';
import Content from './tabs-content.svelte';
import { tv } from 'tailwind-variants';

export const tabsVariants = tv({
	base: 'inline-flex h-9 items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground'
});

export const tabsTriggerVariants = tv({
	base: 'focus-visible:ring-ring inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50'
});

export const tabsContentVariants = tv({
	base: 'focus-visible:ring-ring ring-offset-background mt-2 focus-visible:outline-none focus-visible:ring-2'
});

export {
	Root,
	List,
	Trigger,
	Content,
	Root as Tabs,
	List as TabsList,
	Trigger as TabsTrigger,
	Content as TabsContent
};

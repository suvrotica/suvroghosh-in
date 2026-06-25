import Root from './tooltip.svelte';
import Trigger from './tooltip-trigger.svelte';
import Content from './tooltip-content.svelte';
import { tv } from 'tailwind-variants';

export const tooltipVariants = tv({
	base: 'bg-primary text-primary-foreground animate-in fade-in-0 zoom-in-95 z-50 w-fit rounded-md px-3 py-1.5 text-xs text-balance'
});

export const tooltipArrowVariants = tv({
	base: 'bg-primary fill-primary z-50'
});

export {
	Root,
	Trigger,
	Content,
	Root as Tooltip,
	Trigger as TooltipTrigger,
	Content as TooltipContent
};

import Root from './sheet.svelte';
import Trigger from './sheet-trigger.svelte';
import Portal from './sheet-portal.svelte';
import Overlay from './sheet-overlay.svelte';
import Content from './sheet-content.svelte';
import Header from './sheet-header.svelte';
import Footer from './sheet-footer.svelte';
import Title from './sheet-title.svelte';
import Description from './sheet-description.svelte';
import Close from './sheet-close.svelte';
import { tv } from 'tailwind-variants';

export const sheetVariants = tv({
	base: 'bg-background fixed z-50 gap-4 p-6 shadow-lg transition ease-in-out data-[state=open]:animate-in data-[state=closed]:animate-out',
	variants: {
		side: {
			top: 'data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top inset-x-0 top-0 border-b',
			bottom:
				'data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom inset-x-0 bottom-0 border-t',
			left: 'data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left inset-y-0 left-0 h-full w-3/4 border-r sm:max-w-sm',
			right:
				'data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right inset-y-0 right-0 h-full w-3/4 border-l sm:max-w-sm'
		}
	},
	defaultVariants: {
		side: 'right'
	}
});

export type SheetSide = 'top' | 'bottom' | 'left' | 'right';

export {
	Root,
	Trigger,
	Portal,
	Overlay,
	Content,
	Header,
	Footer,
	Title,
	Description,
	Close,
	Root as Sheet,
	Trigger as SheetTrigger,
	Portal as SheetPortal,
	Overlay as SheetOverlay,
	Content as SheetContent,
	Header as SheetHeader,
	Footer as SheetFooter,
	Title as SheetTitle,
	Description as SheetDescription,
	Close as SheetClose
};

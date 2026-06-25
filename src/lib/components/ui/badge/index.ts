import Root from './badge.svelte';
import { tv, type VariantProps } from 'tailwind-variants';

export const badgeVariants = tv({
	base: 'focus:ring-ring inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2',
	variants: {
		variant: {
			default: 'border-transparent bg-primary text-primary-foreground shadow',
			secondary: 'border-transparent bg-secondary text-secondary-foreground',
			destructive: 'border-transparent bg-destructive text-destructive-foreground shadow',
			outline: 'text-foreground'
		}
	},
	defaultVariants: {
		variant: 'default'
	}
});

export type BadgeVariant = VariantProps<typeof badgeVariants>['variant'];

export { Root, Root as Badge };

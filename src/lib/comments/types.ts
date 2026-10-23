export const COMMENT_STATUSES = ['pending', 'approved', 'rejected', 'hidden'] as const;
export type CommentStatus = (typeof COMMENT_STATUSES)[number];

export type PublicComment = {
	id: string;
	parent_id: string | null;
	display_name: string;
	body: string;
	is_author: boolean;
	created_at: string;
	reply_count: number;
};

export type CommentPage = {
	comments: PublicComment[];
	total: number;
	commentCount: number;
	page: number;
	pageSize: number;
};

export type AdminComment = PublicComment & {
	post_slug: string;
	status: CommentStatus;
	read_at: string | null;
	updated_at: string;
	parent_body: string | null;
	parent_display_name: string | null;
	parent_status: CommentStatus | null;
	history: { action: string; created_at: string }[];
};

export type ModerationPage = {
	comments: AdminComment[];
	total: number;
	pending: number;
	unread: number;
	page: number;
	pageSize: number;
	articles: { slug: string; title: string; href: string }[];
};

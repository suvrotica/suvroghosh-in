export type AnalyticsRanking = { key: string; label: string; views: number };

/** Aggregate page views, never unique people or individual browsing histories. */
export type AnalyticsReport = {
	configured: boolean;
	error?: string;
	from: string;
	to: string;
	timezone: string;
	generatedAt: string;
	retentionDays: number;
	totalViews: number;
	distinctPages: number;
	countryCount: number;
	cityCount: number;
	series: { date: string; views: number }[];
	pages: AnalyticsRanking[];
	countries: AnalyticsRanking[];
	cities: AnalyticsRanking[];
	referrers: AnalyticsRanking[];
	devices: AnalyticsRanking[];
	browsers: AnalyticsRanking[];
};

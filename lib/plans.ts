export const PLAN_IDS = ['starter', 'pro', 'agency'] as const;
export type PlanId = (typeof PLAN_IDS)[number];
export type BillingPeriod = 'monthly' | 'annual';
export const TRIAL_DAYS = 3;
export const TRIAL_PLAN: PlanId = 'pro';

export const PLAN_FEATURES = [
  'automaticScans', 'manualScans', 'emailAlerts', 'standardFixGuides', 'publicScoreLink',
  'slackAlerts', 'discordAlerts', 'webhookAlerts', 'generatedFixes', 'pdfReports',
  'scoreBadge', 'scanComparison', 'priorityEmailSupport', 'priorityQueue',
  'whiteLabelReports', 'team', 'clientWorkspaces', 'fullApi', 'ciEndpoint',
  'csvExport', 'jsonExport', 'limitedApi'
] as const;
export type PlanFeature = (typeof PLAN_FEATURES)[number];
export type PlanLimit = 'sites' | 'manualScansPerMonth' | 'historyDays' | 'teamMembers';

type Plan = {
  id: PlanId;
  name: 'Starter' | 'Pro' | 'Agency';
  priceEur: Record<BillingPeriod, number>;
  limits: Record<PlanLimit, number | null>;
  scanIntervalHours: number;
  features: Readonly<Record<PlanFeature, boolean>>;
};

const starterFeatures: Record<PlanFeature, boolean> = {
  automaticScans: true, manualScans: true, emailAlerts: true, standardFixGuides: true,
  publicScoreLink: true, slackAlerts: false, discordAlerts: false, webhookAlerts: false,
  generatedFixes: false, pdfReports: false, scoreBadge: false, scanComparison: false,
  priorityEmailSupport: false, priorityQueue: false, whiteLabelReports: false,
  team: false, clientWorkspaces: false, fullApi: false, ciEndpoint: false,
  csvExport: false, jsonExport: false, limitedApi: false
};

const proFeatures: Record<PlanFeature, boolean> = {
  ...starterFeatures, slackAlerts: true, discordAlerts: true, webhookAlerts: true,
  generatedFixes: true, pdfReports: true, scoreBadge: true, scanComparison: true,
  priorityEmailSupport: true, limitedApi: true
};

export const PLANS = {
  starter: {
    id: 'starter', name: 'Starter', priceEur: {monthly: 12, annual: 120},
    limits: {sites: 1, manualScansPerMonth: 3, historyDays: 30, teamMembers: 1},
    scanIntervalHours: 168, features: starterFeatures
  },
  pro: {
    id: 'pro', name: 'Pro', priceEur: {monthly: 39, annual: 390},
    limits: {sites: 5, manualScansPerMonth: null, historyDays: 90, teamMembers: 1},
    scanIntervalHours: 24, features: proFeatures
  },
  agency: {
    id: 'agency', name: 'Agency', priceEur: {monthly: 99, annual: 990},
    limits: {sites: 25, manualScansPerMonth: null, historyDays: 365, teamMembers: 5},
    scanIntervalHours: 24,
    features: {
      ...proFeatures, priorityQueue: true, whiteLabelReports: true, team: true,
      clientWorkspaces: true, fullApi: true, ciEndpoint: true, csvExport: true, jsonExport: true
    }
  }
} as const satisfies Record<PlanId, Plan>;

export function getPlan(id: PlanId): Plan { return PLANS[id]; }
export function hasFeature(id: PlanId, feature: PlanFeature): boolean { return PLANS[id].features[feature]; }
export function getLimit(id: PlanId, limit: PlanLimit): number | null { return PLANS[id].limits[limit]; }
export function scanIntervalHours(id: PlanId): number { return PLANS[id].scanIntervalHours; }

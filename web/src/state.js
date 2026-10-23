// Single in-memory app state. Data arrays are refreshed from Supabase after every write.
export const state = {
  user: null,
  workspaces: [],
  workspace: null,
  clients: [],
  jobs: [],
  costs: [],
  // view state
  route: 'overview',
  period: 'all',
  jobFilter: 'all',
  costFilter: 'all',
  sortJobs: 'newest',
  searchTerm: '',
  busy: false,
};

export const costsForJob = (jobId) => state.costs.filter((c) => c.job_id === jobId);
export const hasSample = () => state.jobs.some((j) => j.is_sample);

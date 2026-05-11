ALTER TABLE visits
  ADD COLUMN perf_ttfb_ms REAL;

ALTER TABLE visits
  ADD COLUMN perf_fcp_ms REAL;

ALTER TABLE visits
  ADD COLUMN perf_lcp_ms REAL;

ALTER TABLE visits
  ADD COLUMN perf_cls REAL;

ALTER TABLE visits
  ADD COLUMN perf_inp_ms REAL;

ALTER TABLE visits_archive
  ADD COLUMN perf_ttfb_ms REAL;

ALTER TABLE visits_archive
  ADD COLUMN perf_fcp_ms REAL;

ALTER TABLE visits_archive
  ADD COLUMN perf_lcp_ms REAL;

ALTER TABLE visits_archive
  ADD COLUMN perf_cls REAL;

ALTER TABLE visits_archive
  ADD COLUMN perf_inp_ms REAL;

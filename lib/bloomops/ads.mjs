// Ads selects canonical Work; department eligibility never grants access.
import { departmentProjectCondition, departmentWorkProjection } from './department-work.mjs';
export { DEPARTMENT_WORK_PAGE_SIZE as ADS_PAGE_SIZE, DEPARTMENT_WORK_FACET_LIMIT as ADS_FACET_LIMIT,
  normalizeDepartmentWorkFilters as normalizeAdsFilters } from './department-work.mjs';
export const adsProjectCondition = () => departmentProjectCondition('ads');
export const adsProjection = (db, actor, input = {}, options = {}) => departmentWorkProjection('ads', db, actor, input, options);

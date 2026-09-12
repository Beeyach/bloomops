// Systems selects canonical Work; department eligibility never grants access.
import { departmentProjectCondition, departmentWorkProjection } from './department-work.mjs';
export { DEPARTMENT_WORK_PAGE_SIZE as SYSTEMS_PAGE_SIZE, DEPARTMENT_WORK_FACET_LIMIT as SYSTEMS_FACET_LIMIT,
  normalizeDepartmentWorkFilters as normalizeSystemsFilters } from './department-work.mjs';
export const systemsProjectCondition = () => departmentProjectCondition('systems');
export const systemsProjection = (db, actor, input = {}, options = {}) => departmentWorkProjection('systems', db, actor, input, options);

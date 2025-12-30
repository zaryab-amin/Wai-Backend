const operators = ['eq', 'ne', 'gte', 'lte'];

const convertToBooleanOrKeep = (value) => {
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  return value;
}

exports.queryBuilder = (queries = []) => {
  const queryObj = {};
  for (const query of queries) {
    if (!query?.value) {
      continue;
    }
    if (query?.type === 'search' && query?.value) {
      queryObj[query?.field] = { $regex: new RegExp(`^${query?.value}`, 'i') };
    }
    query.value = convertToBooleanOrKeep(query?.value);
    if (query?.type === 'field') {
      queryObj[query?.field] = query?.value;
    }
    if (operators.includes(query?.type)) {
      queryObj[query?.field] = { ...queryObj[query?.field], [`$${query?.type}`]: query?.value };
    }
    if (query?.type === 'in' && query?.value?.join("")?.length > 0) {
      queryObj[query?.field] = { [`$${query?.type}`]: query?.value };
    }
  }
  return queryObj;
};

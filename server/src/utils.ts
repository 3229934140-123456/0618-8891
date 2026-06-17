export function parseJsonField(val: any, fallback: any) {
  if (val === undefined || val === null || val === '') return fallback;
  if (typeof val !== 'string') return val;
  try {
    return JSON.parse(val);
  } catch {
    return fallback;
  }
}

export function serializeEndpoint(row: any) {
  if (!row) return row;
  return {
    ...row,
    parameters: parseJsonField(row.parameters, []),
    request_body: parseJsonField(row.request_body, null),
    response_schema: parseJsonField(row.response_schema, null),
    request_examples: parseJsonField(row.request_examples, {}),
    response_examples: parseJsonField(row.response_examples, {}),
  };
}

export function serializeEndpointList(rows: any[]) {
  return (rows || []).map(serializeEndpoint);
}

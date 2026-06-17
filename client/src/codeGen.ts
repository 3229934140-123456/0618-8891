import type { Parameter, Endpoint } from './types';

export function generateCurl(endpoint: Endpoint, baseUrl: string = ''): string {
  const url = buildUrl(endpoint, baseUrl);
  let cmd = `curl -X ${endpoint.method} '${url}'`;

  const headers = endpoint.parameters?.filter((p) => p.in === 'header') || [];
  headers.forEach((h) => {
    cmd += ` \\\n  -H '${h.name}: ${h.default || ''}'`;
  });

  if (endpoint.method !== 'GET' && endpoint.method !== 'HEAD') {
    if (!headers.find((h) => h.name.toLowerCase() === 'content-type')) {
      cmd += ` \\\n  -H 'Content-Type: application/json'`;
    }
    if (endpoint.request_examples?.default) {
      cmd += ` \\\n  -d '${JSON.stringify(endpoint.request_examples.default, null, 2).replace(/\n/g, '\\n')}'`;
    }
  }
  return cmd;
}

export function generatePython(endpoint: Endpoint, baseUrl: string = ''): string {
  const url = buildUrl(endpoint, baseUrl);
  let code = `import requests\n\n`;
  code += `url = "${url}"\n`;

  const headers = endpoint.parameters?.filter((p) => p.in === 'header') || [];
  if (headers.length) {
    code += `headers = {\n`;
    headers.forEach((h) => {
      code += `    "${h.name}": "${h.default || ''}",\n`;
    });
    code += `}\n`;
  } else {
    code += `headers = {}\n`;
  }

  const queryParams = endpoint.parameters?.filter((p) => p.in === 'query') || [];
  if (queryParams.length) {
    code += `params = {\n`;
    queryParams.forEach((p) => {
      code += `    "${p.name}": "${p.default || ''}",\n`;
    });
    code += `}\n`;
  }

  let fetchLine = `response = requests.${endpoint.method.toLowerCase()}(url`;
  if (headers.length) fetchLine += `, headers=headers`;
  if (queryParams.length) fetchLine += `, params=params`;

  if (endpoint.method !== 'GET' && endpoint.method !== 'HEAD') {
    if (!headers.find((h) => h.name.toLowerCase() === 'content-type')) {
      code += `headers["Content-Type"] = "application/json"\n`;
    }
    if (endpoint.request_examples?.default) {
      code += `\npayload = ${JSON.stringify(endpoint.request_examples.default, null, 4)}\n`;
      fetchLine += `, json=payload`;
    }
  }
  fetchLine += `)\n`;
  code += `\n${fetchLine}`;
  code += `print(response.status_code)\nprint(response.json())\n`;
  return code;
}

export function generateJavaScript(endpoint: Endpoint, baseUrl: string = ''): string {
  const url = buildUrl(endpoint, baseUrl);
  let code = `const url = '${url}';\n\n`;

  const headers = endpoint.parameters?.filter((p) => p.in === 'header') || [];
  let opts: string[] = [`  method: '${endpoint.method}'`];

  if (headers.length) {
    opts.push(`  headers: {`);
    headers.forEach((h) => {
      opts.push(`    '${h.name}': '${h.default || ''}',`);
    });
    opts.push(`  }`);
  }

  if (endpoint.method !== 'GET' && endpoint.method !== 'HEAD') {
    if (!headers.find((h) => h.name.toLowerCase() === 'content-type')) {
      if (!opts.find((o) => o.includes('headers'))) {
        opts.push(`  headers: {`);
        opts.push(`    'Content-Type': 'application/json',`);
        opts.push(`  }`);
      } else {
        const idx = opts.findIndex((o) => o.includes('}') && opts[idx - 1]?.includes('headers'));
        opts.splice(idx, 0, `    'Content-Type': 'application/json',`);
      }
    }
    if (endpoint.request_examples?.default) {
      opts.push(`  body: JSON.stringify(${JSON.stringify(endpoint.request_examples.default, null, 4).split('\n').join('\n  ')})`);
    }
  }

  code += `fetch(url, {\n${opts.join(',\n')}\n})\n`;
  code += `  .then(res => res.json())\n`;
  code += `  .then(data => console.log(data))\n`;
  code += `  .catch(err => console.error(err));\n`;
  return code;
}

function buildUrl(endpoint: Endpoint, baseUrl: string): string {
  let path = endpoint.path;
  const pathParams = endpoint.parameters?.filter((p) => p.in === 'path') || [];
  pathParams.forEach((p) => {
    path = path.replace(`{${p.name}}`, p.default || `{${p.name}}`);
    path = path.replace(`:${p.name}`, p.default || `:${p.name}`);
  });

  const queryParams = endpoint.parameters?.filter((p) => p.in === 'query') || [];
  if (queryParams.length) {
    const qs = queryParams
      .filter((p) => p.default)
      .map((p) => `${encodeURIComponent(p.name)}=${encodeURIComponent(p.default!)}`)
      .join('&');
    if (qs) path += `?${qs}`;
  }

  if (baseUrl && !path.startsWith('http')) {
    return baseUrl.replace(/\/$/, '') + path;
  }
  return path;
}

export function generateCode(lang: string, endpoint: Endpoint, baseUrl: string = ''): string {
  switch (lang) {
    case 'curl':
      return generateCurl(endpoint, baseUrl);
    case 'python':
      return generatePython(endpoint, baseUrl);
    case 'javascript':
      return generateJavaScript(endpoint, baseUrl);
    default:
      return generateCurl(endpoint, baseUrl);
  }
}

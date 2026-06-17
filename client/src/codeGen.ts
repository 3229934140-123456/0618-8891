import type { Parameter, Endpoint } from './types';

export function generateCurl(endpoint: Endpoint, baseUrl: string = ''): string {
  try {
    const url = buildUrl(endpoint, baseUrl);
    let cmd = `curl -X ${endpoint.method} '${url.replace(/'/g, "'\\''")}'`;

    const headers = endpoint.parameters?.filter((p) => p.in === 'header') || [];
    headers.forEach((h) => {
      cmd += ` \\\n  -H '${h.name.replace(/'/g, "'\\''")}: ${(h.default || '').replace(/'/g, "'\\''")}'`;
    });

    if (endpoint.method !== 'GET' && endpoint.method !== 'HEAD') {
      if (!headers.find((h) => h.name.toLowerCase() === 'content-type')) {
        cmd += ` \\\n  -H 'Content-Type: application/json'`;
      }
      if (endpoint.request_examples?.default) {
        const bodyStr = JSON.stringify(endpoint.request_examples.default, null, 2).replace(/'/g, "'\\''").replace(/\n/g, '\\n');
        cmd += ` \\\n  -d '${bodyStr}'`;
      }
    }
    return cmd;
  } catch (e: any) {
    return `# 代码生成失败: ${e?.message || '未知错误'}`;
  }
}

export function generatePython(endpoint: Endpoint, baseUrl: string = ''): string {
  try {
    const url = buildUrl(endpoint, baseUrl);
    let code = `import requests\n\n`;
    code += `url = "${url.replace(/"/g, '\\"')}"\n`;

    const headers = endpoint.parameters?.filter((p) => p.in === 'header') || [];
    const hasBody = endpoint.method !== 'GET' && endpoint.method !== 'HEAD';
    let headersArr = [...headers];
    if (hasBody && !headersArr.find((h) => h.name.toLowerCase() === 'content-type')) {
      headersArr = [...headersArr, { name: 'Content-Type', in: 'header', type: 'string', required: false, description: '', default: 'application/json' }];
    }

    if (headersArr.length) {
      code += `headers = {\n`;
      headersArr.forEach((h) => {
        const v = (h.default || '').replace(/"/g, '\\"');
        code += `    "${h.name.replace(/"/g, '\\"')}": "${v}",\n`;
      });
      code += `}\n`;
    } else {
      code += `headers = {}\n`;
    }

    const queryParams = endpoint.parameters?.filter((p) => p.in === 'query') || [];
    if (queryParams.length) {
      code += `params = {\n`;
      queryParams.forEach((p) => {
        code += `    "${p.name.replace(/"/g, '\\"')}": "${(p.default || '').replace(/"/g, '\\"')}",\n`;
      });
      code += `}\n`;
    }

    let fetchLine = `response = requests.${endpoint.method.toLowerCase()}(url`;
    if (headersArr.length) fetchLine += `, headers=headers`;
    if (queryParams.length) fetchLine += `, params=params`;

    if (hasBody && endpoint.request_examples?.default) {
      code += `\npayload = ${JSON.stringify(endpoint.request_examples.default, null, 4)}\n`;
      fetchLine += `, json=payload`;
    }
    fetchLine += `)\n`;
    code += `\n${fetchLine}`;
    code += `print(response.status_code)\nprint(response.json())\n`;
    return code;
  } catch (e: any) {
    return `# 代码生成失败: ${e?.message || '未知错误'}`;
  }
}

export function generateJavaScript(endpoint: Endpoint, baseUrl: string = ''): string {
  try {
    const url = buildUrl(endpoint, baseUrl);
    let code = `const url = '${url}';\n\n`;

    const headers: Record<string, string> = {};
    (endpoint.parameters || [])
      .filter((p) => p.in === 'header')
      .forEach((h) => {
        headers[h.name] = h.default || '';
      });

    const hasBody = endpoint.method !== 'GET' && endpoint.method !== 'HEAD';
    if (hasBody && !Object.keys(headers).some((k) => k.toLowerCase() === 'content-type')) {
      headers['Content-Type'] = 'application/json';
    }

    const opts: string[] = [`  method: '${endpoint.method}'`];

    if (Object.keys(headers).length > 0) {
      const headerLines = Object.entries(headers)
        .map(([k, v]) => `    '${k.replace(/'/g, "\\'")}': '${v.replace(/'/g, "\\'")}',`)
        .join('\n');
      opts.push(`  headers: {\n${headerLines}\n  }`);
    }

    if (hasBody && endpoint.request_examples?.default) {
      const bodyStr = JSON.stringify(endpoint.request_examples.default, null, 4);
      const indented = bodyStr.split('\n').join('\n  ');
      opts.push(`  body: JSON.stringify(${indented})`);
    }

    code += `fetch(url, {\n${opts.join(',\n')}\n})\n`;
    code += `  .then(res => res.json())\n`;
    code += `  .then(data => console.log(data))\n`;
    code += `  .catch(err => console.error(err));\n`;
    return code;
  } catch (e: any) {
    return `// 代码生成失败: ${e?.message || '未知错误'}\nconsole.error('Code generation error');`;
  }
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

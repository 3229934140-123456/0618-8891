import { useState } from 'react';
import { Button, Form, Input, Select, Space, Tabs, Table, Tag, Spin, Alert, Typography } from 'antd';
import { PlayCircleOutlined, PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import type { Endpoint, Parameter } from '../types';
import { toolApi } from '../api';

const { Title, Text } = Typography;
const { TextArea } = Input;

interface Props {
  endpoint: Endpoint;
  baseUrl?: string;
}

interface HeaderRow {
  key: string;
  keyName: string;
  value: string;
  enabled: boolean;
}

interface QueryRow {
  key: string;
  keyName: string;
  value: string;
  enabled: boolean;
}

export default function EndpointDebugger({ endpoint, baseUrl = '' }: Props) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [pathParams, setPathParams] = useState<Record<string, string>>({});
  const [queryParams, setQueryParams] = useState<QueryRow[]>(
    (endpoint.parameters || [])
      .filter((p) => p.in === 'query')
      .map((p) => ({ key: Math.random().toString(36), keyName: p.name, value: p.default || '', enabled: true }))
  );
  const [headers, setHeaders] = useState<HeaderRow[]>([
    { key: Math.random().toString(36), keyName: 'Content-Type', value: 'application/json', enabled: true },
    ...(endpoint.parameters || [])
      .filter((p) => p.in === 'header')
      .map((p) => ({ key: Math.random().toString(36), keyName: p.name, value: p.default || '', enabled: true })),
  ]);
  const [body, setBody] = useState(
    endpoint.request_examples?.default ? JSON.stringify(endpoint.request_examples.default, null, 2) : ''
  );

  const buildUrl = () => {
    let path = endpoint.path;
    for (const [k, v] of Object.entries(pathParams)) {
      path = path.replace(`{${k}}`, v || `{${k}}`);
      path = path.replace(`:${k}`, v || `:${k}`);
    }
    const enabledQuery = queryParams.filter((q) => q.enabled && q.keyName && q.value);
    if (enabledQuery.length) {
      const qs = enabledQuery.map((q) => `${encodeURIComponent(q.keyName)}=${encodeURIComponent(q.value)}`).join('&');
      path += (path.includes('?') ? '&' : '?') + qs;
    }
    if (baseUrl && !path.startsWith('http')) {
      return baseUrl.replace(/\/$/, '') + path;
    }
    return path;
  };

  const sendRequest = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const url = buildUrl();
      const headerList = headers.filter((h) => h.enabled && h.keyName).map((h) => ({ key: h.keyName, value: h.value }));
      let parsedBody: any = undefined;
      if (body.trim() && endpoint.method !== 'GET' && endpoint.method !== 'HEAD') {
        try {
          parsedBody = JSON.parse(body);
        } catch {
          parsedBody = body;
        }
      }
      const res = await toolApi.proxy({ url, method: endpoint.method, headers: headerList, body: parsedBody });
      setResult(res);
    } catch (e: any) {
      setError(e.response?.data?.error || e.message || '请求失败');
    } finally {
      setLoading(false);
    }
  };

  const pathParamList = (endpoint.parameters || []).filter((p) => p.in === 'path');

  return (
    <div>
      <Alert
        message={
          <Space>
            <Tag color={endpoint.method === 'GET' ? 'green' : endpoint.method === 'POST' ? 'blue' : 'orange'}>
              {endpoint.method}
            </Tag>
            <Text code style={{ fontSize: 14 }}>{buildUrl()}</Text>
          </Space>
        }
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
      />

      <Tabs
        items={[
          {
            key: 'params',
            label: '参数',
            children: (
              <div style={{ padding: '8px 0' }}>
                {pathParamList.length > 0 && (
                  <>
                    <Title level={5}>路径参数</Title>
                    <Space direction="vertical" style={{ width: '100%', marginBottom: 16 }}>
                      {pathParamList.map((p) => (
                        <Space key={p.name}>
                          <Text code style={{ minWidth: 120 }}>{p.name}</Text>
                          <Input
                            placeholder={p.description}
                            value={pathParams[p.name] || ''}
                            onChange={(e) => setPathParams({ ...pathParams, [p.name]: e.target.value })}
                            style={{ width: 280 }}
                          />
                          {p.required && <Tag color="red">必填</Tag>}
                          <Text type="secondary">{p.description}</Text>
                        </Space>
                      ))}
                    </Space>
                  </>
                )}

                <Title level={5}>Query 参数</Title>
                <Space direction="vertical" style={{ width: '100%', marginBottom: 8 }}>
                  {queryParams.map((q) => (
                    <Space key={q.key}>
                      <input
                        type="checkbox"
                        checked={q.enabled}
                        onChange={(e) => {
                          const nq = [...queryParams];
                          const idx = nq.findIndex((x) => x.key === q.key);
                          nq[idx].enabled = e.target.checked;
                          setQueryParams(nq);
                        }}
                      />
                      <Input
                        placeholder="参数名"
                        value={q.keyName}
                        onChange={(e) => {
                          const nq = [...queryParams];
                          const idx = nq.findIndex((x) => x.key === q.key);
                          nq[idx].keyName = e.target.value;
                          setQueryParams(nq);
                        }}
                        style={{ width: 160 }}
                      />
                      <Input
                        placeholder="参数值"
                        value={q.value}
                        onChange={(e) => {
                          const nq = [...queryParams];
                          const idx = nq.findIndex((x) => x.key === q.key);
                          nq[idx].value = e.target.value;
                          setQueryParams(nq);
                        }}
                        style={{ width: 240 }}
                      />
                      <Button
                        icon={<DeleteOutlined />}
                        onClick={() => setQueryParams(queryParams.filter((x) => x.key !== q.key))}
                      />
                    </Space>
                  ))}
                </Space>
                <Button
                  icon={<PlusOutlined />}
                  onClick={() => setQueryParams([...queryParams, { key: Math.random().toString(36), keyName: '', value: '', enabled: true }])}
                >
                  添加 Query 参数
                </Button>
              </div>
            ),
          },
          {
            key: 'headers',
            label: 'Headers',
            children: (
              <div style={{ padding: '8px 0' }}>
                <Space direction="vertical" style={{ width: '100%', marginBottom: 8 }}>
                  {headers.map((h) => (
                    <Space key={h.key}>
                      <input
                        type="checkbox"
                        checked={h.enabled}
                        onChange={(e) => {
                          const nh = [...headers];
                          const idx = nh.findIndex((x) => x.key === h.key);
                          nh[idx].enabled = e.target.checked;
                          setHeaders(nh);
                        }}
                      />
                      <Input
                        placeholder="Header 名"
                        value={h.keyName}
                        onChange={(e) => {
                          const nh = [...headers];
                          const idx = nh.findIndex((x) => x.key === h.key);
                          nh[idx].keyName = e.target.value;
                          setHeaders(nh);
                        }}
                        style={{ width: 180 }}
                      />
                      <Input
                        placeholder="值"
                        value={h.value}
                        onChange={(e) => {
                          const nh = [...headers];
                          const idx = nh.findIndex((x) => x.key === h.key);
                          nh[idx].value = e.target.value;
                          setHeaders(nh);
                        }}
                        style={{ width: 280 }}
                      />
                      <Button
                        icon={<DeleteOutlined />}
                        onClick={() => setHeaders(headers.filter((x) => x.key !== h.key))}
                      />
                    </Space>
                  ))}
                </Space>
                <Button
                  icon={<PlusOutlined />}
                  onClick={() => setHeaders([...headers, { key: Math.random().toString(36), keyName: '', value: '', enabled: true }])}
                >
                  添加 Header
                </Button>
              </div>
            ),
          },
          {
            key: 'body',
            label: 'Body',
            disabled: endpoint.method === 'GET' || endpoint.method === 'HEAD',
            children: (
              <TextArea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={12}
                placeholder='{"key": "value"}'
                style={{ fontFamily: 'Consolas, Monaco, monospace' }}
              />
            ),
          },
        ]}
      />

      <div style={{ marginTop: 16 }}>
        <Button type="primary" size="large" icon={<PlayCircleOutlined />} onClick={sendRequest} loading={loading}>
          发送请求
        </Button>
      </div>

      {error && (
        <Alert
          message="请求失败"
          description={error}
          type="error"
          showIcon
          style={{ marginTop: 16 }}
        />
      )}

      {loading && (
        <div style={{ textAlign: 'center', padding: 48 }}>
          <Spin size="large" />
        </div>
      )}

      {result && (
        <div style={{ marginTop: 24 }}>
          <Title level={4}>
            响应结果
            <Space style={{ marginLeft: 12 }}>
              <Tag color={result.status >= 200 && result.status < 300 ? 'green' : 'red'}>
                HTTP {result.status} {result.statusText}
              </Tag>
              <Tag>{result.elapsed_ms}ms</Tag>
            </Space>
          </Title>
          <Tabs
            items={[
              {
                key: 'body',
                label: '响应体',
                children: (
                  <pre className="code-block" style={{ maxHeight: 400, overflow: 'auto' }}>
                    {typeof result.body === 'string' ? result.body : JSON.stringify(result.body, null, 2)}
                  </pre>
                ),
              },
              {
                key: 'headers',
                label: '响应头',
                children: (
                  <Table
                    size="small"
                    dataSource={Object.entries(result.headers || {}).map(([k, v]) => ({ key: k, name: k, value: v }))}
                    columns={[
                      { title: '名称', dataIndex: 'name', key: 'name', width: 200 },
                      { title: '值', dataIndex: 'value', key: 'value' },
                    ]}
                    pagination={false}
                  />
                ),
              },
            ]}
          />
        </div>
      )}
    </div>
  );
}

import { useState, useEffect, useMemo } from 'react';
import { Layout, Typography, Space, Tag, Tabs, Button } from 'antd';
import { CommentOutlined, GlobalOutlined, HistoryOutlined } from '@ant-design/icons';
import { useParams } from 'react-router-dom';
import { docApi } from '../api';
import type { Document, Module, Endpoint } from '../types';
import EndpointDebugger from '../components/EndpointDebugger';
import CodeSamples from '../components/CodeSamples';
import dayjs from 'dayjs';

const { Sider, Content } = Layout;
const { Title, Text, Paragraph } = Typography;

export default function PublicDocument() {
  const { id } = useParams<{ id: string }>();
  const [doc, setDoc] = useState<Document | null>(null);
  const [modules, setModules] = useState<Module[]>([]);
  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [activeKey, setActiveKey] = useState<string>('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await docApi.get(id!);
      if (data.visibility !== 'public') {
        setError('该文档未公开或您无权限访问');
        return;
      }
      setDoc(data);
      setModules(data.modules || []);
      setEndpoints(data.endpoints || []);
    } catch (e: any) {
      setError(e.response?.data?.error || '加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [id]);

  const menuItems = useMemo(() => {
    const items: any[] = [{ key: 'overview', label: '📄 文档概览' }];
    modules.forEach((m) => {
      const children = endpoints
        .filter((e) => e.module_id === m.id)
        .map((e) => ({
          key: `ep-${e.id}`,
          label: (
            <span>
              <span className={`http-method http-${e.method}`}>{e.method}</span>{' '}
              <span style={{ marginLeft: 8 }}>{e.name}</span>
            </span>
          ),
        }));
      items.push({
        key: `mod-${m.id}`,
        label: <span>📁 {m.name}</span>,
        children,
      });
    });
    return items;
  }, [modules, endpoints]);

  if (loading) {
    return <div style={{ padding: 48, textAlign: 'center' }}>加载中...</div>;
  }

  if (error || !doc) {
    return (
      <div style={{ padding: 48, textAlign: 'center' }}>
        <Title level={3} type="danger">{error || '文档不存在'}</Title>
        <Button type="primary" onClick={() => (location.href = '/login')}>去登录</Button>
      </div>
    );
  }

  const renderOverview = () => (
    <div>
      <Space align="center" style={{ marginBottom: 16 }}>
        <Title level={2} style={{ margin: 0 }}>{doc.title}</Title>
        <Tag color="green" icon={<GlobalOutlined />}>公开站点</Tag>
      </Space>
      <Paragraph style={{ fontSize: 15 }}>{doc.description || '暂无描述'}</Paragraph>
      {doc.base_url && (
        <Paragraph>
          <Text strong>基础 URL：</Text>
          <Text code>{doc.base_url}</Text>
        </Paragraph>
      )}
      <Paragraph type="secondary">更新于 {dayjs(doc.updated_at).format('YYYY-MM-DD HH:mm')}</Paragraph>
      <div style={{ height: 1, background: '#f0f0f0', margin: '24px 0' }} />
      <Title level={3}>接口目录</Title>
      {modules.map((m) => (
        <div key={m.id} style={{ marginBottom: 24 }}>
          <Title level={4} style={{ marginTop: 16 }}>{m.name}</Title>
          {m.description && <Paragraph type="secondary">{m.description}</Paragraph>}
          {endpoints
            .filter((e) => e.module_id === m.id)
            .map((ep) => (
              <div
                key={ep.id}
                onClick={() => setActiveKey(`ep-${ep.id}`)}
                style={{
                  padding: '8px 12px',
                  cursor: 'pointer',
                  borderRadius: 4,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                }}
              >
                <span className={`http-method http-${ep.method}`}>{ep.method}</span>
                <span>{ep.name}</span>
                <Text code style={{ color: '#999' }}>{ep.path}</Text>
              </div>
            ))}
        </div>
      ))}
    </div>
  );

  const renderEndpoint = (epId: string) => {
    const ep = endpoints.find((e) => e.id === epId);
    if (!ep) return null;
    return (
      <div>
        <Space align="center" style={{ marginBottom: 16 }}>
          <span className={`http-method http-${ep.method}`} style={{ fontSize: 14 }}>{ep.method}</span>
          <Title level={3} style={{ margin: 0 }}>{ep.name}</Title>
        </Space>
        <Paragraph>
          <Text code style={{ fontSize: 15, padding: '4px 12px' }}>{ep.path}</Text>
        </Paragraph>
        {ep.description && <Paragraph>{ep.description}</Paragraph>}

        <Tabs
          items={[
            {
              key: 'params',
              label: '参数说明',
              children: (
                <div>
                  {ep.parameters && ep.parameters.length > 0 ? (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ background: '#fafafa' }}>
                          <th style={{ padding: 8, border: '1px solid #f0f0f0', textAlign: 'left' }}>名称</th>
                          <th style={{ padding: 8, border: '1px solid #f0f0f0', textAlign: 'left' }}>位置</th>
                          <th style={{ padding: 8, border: '1px solid #f0f0f0', textAlign: 'left' }}>类型</th>
                          <th style={{ padding: 8, border: '1px solid #f0f0f0', textAlign: 'left' }}>必填</th>
                          <th style={{ padding: 8, border: '1px solid #f0f0f0', textAlign: 'left' }}>说明</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ep.parameters.map((p, i) => (
                          <tr key={i}>
                            <td style={{ padding: 8, border: '1px solid #f0f0f0' }}><Text code>{p.name}</Text></td>
                            <td style={{ padding: 8, border: '1px solid #f0f0f0' }}>{p.in}</td>
                            <td style={{ padding: 8, border: '1px solid #f0f0f0' }}>{p.type}</td>
                            <td style={{ padding: 8, border: '1px solid #f0f0f0' }}>{p.required ? '是' : '否'}</td>
                            <td style={{ padding: 8, border: '1px solid #f0f0f0' }}>{p.description}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <Paragraph type="secondary">该接口无参数</Paragraph>
                  )}
                </div>
              ),
            },
            {
              key: 'examples',
              label: '代码示例',
              children: <CodeSamples endpoint={ep} baseUrl={doc.base_url} />,
            },
            {
              key: 'debug',
              label: '在线调试',
              children: <EndpointDebugger endpoint={ep} baseUrl={doc.base_url} />,
            },
            {
              key: 'response',
              label: '响应示例',
              children: ep.response_examples?.default ? (
                <pre className="code-block">{JSON.stringify(ep.response_examples.default, null, 2)}</pre>
              ) : (
                <Paragraph type="secondary">暂无响应示例</Paragraph>
              ),
            },
          ]}
        />
      </div>
    );
  };

  let content;
  if (activeKey === 'overview') content = renderOverview();
  else if (activeKey.startsWith('ep-')) content = renderEndpoint(activeKey.replace('ep-', ''));

  return (
    <Layout style={{ minHeight: '100vh', background: '#fff' }}>
      <Sider width={280} theme="light" style={{ borderRight: '1px solid #f0f0f0', padding: 16, height: '100vh', overflowY: 'auto', position: 'sticky', top: 0 }}>
        <div style={{ padding: '8px 0 16px', borderBottom: '1px solid #f0f0f0', marginBottom: 12 }}>
          <Title level={4} style={{ margin: 0 }}>
            <GlobalOutlined style={{ marginRight: 8 }} />
            {doc.title}
          </Title>
        </div>
        <Tabs
          tabPosition="left"
          activeKey={activeKey}
          onChange={setActiveKey}
          items={menuItems}
          style={{ height: '100%' }}
        />
      </Sider>
      <Content style={{ padding: 48, maxWidth: 1200, margin: '0 auto' }}>
        {content}
      </Content>
    </Layout>
  );
}

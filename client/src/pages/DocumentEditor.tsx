import { useState, useEffect, useMemo } from 'react';
import { Layout, Typography, Space, Button, Tabs, Tag, Tooltip, Modal, Form, Input, Select, App, Divider, List, InputNumber, Switch } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, CommentOutlined, HistoryOutlined, SendOutlined, SettingOutlined, GlobalOutlined, ShareAltOutlined, UploadOutlined } from '@ant-design/icons';
import { useParams } from 'react-router-dom';
import { docApi, moduleApi, endpointApi, commentApi, versionApi, toolApi } from '../api';
import type { Document, Module, Endpoint, Parameter, Comment as CommentType } from '../types';
import { useAuth } from '../store';
import EndpointDebugger from '../components/EndpointDebugger';
import CodeSamples from '../components/CodeSamples';
import dayjs from 'dayjs';

const { Sider, Content } = Layout;
const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

export default function DocumentEditor() {
  const { id } = useParams<{ id: string }>();
  const [doc, setDoc] = useState<Document | null>(null);
  const [modules, setModules] = useState<Module[]>([]);
  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [activeKey, setActiveKey] = useState<string>('overview');
  const [loading, setLoading] = useState(true);
  const [moduleModalOpen, setModuleModalOpen] = useState(false);
  const [editingModule, setEditingModule] = useState<Module | null>(null);
  const [endpointModalOpen, setEndpointModalOpen] = useState(false);
  const [editingEndpoint, setEditingEndpoint] = useState<Endpoint | null>(null);
  const [currentModuleId, setCurrentModuleId] = useState<string>('');
  const [commentModalOpen, setCommentModalOpen] = useState(false);
  const [commentTarget, setCommentTarget] = useState<{ type: string; id: string; name: string } | null>(null);
  const [comments, setComments] = useState<CommentType[]>([]);
  const [newComment, setNewComment] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [versionOpen, setVersionOpen] = useState(false);
  const [versions, setVersions] = useState<any[]>([]);
  const [changelogOpen, setChangelogOpen] = useState(false);
  const [changelogs, setChangelogs] = useState<any[]>([]);
  const [shareOpen, setShareOpen] = useState(false);
  const [subscribeEmail, setSubscribeEmail] = useState('');
  const [moduleForm] = Form.useForm();
  const [endpointForm] = Form.useForm();
  const [settingsForm] = Form.useForm();
  const { user } = useAuth();
  const { message } = App.useApp();

  const load = async () => {
    setLoading(true);
    try {
      const data = await docApi.get(id!);
      setDoc(data);
      setModules(data.modules || []);
      setEndpoints(data.endpoints || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [id]);

  const saveDocVersion = async (summary: string) => {
    await versionApi.create(id!, {
      content: { modules, endpoints },
      change_summary: summary,
    });
  };

  const handleCreateModule = async (values: any) => {
    try {
      if (editingModule) {
        await moduleApi.update(editingModule.id, values);
      } else {
        await moduleApi.create(id!, values);
      }
      message.success(editingModule ? '模块已更新' : '模块已创建');
      setModuleModalOpen(false);
      setEditingModule(null);
      moduleForm.resetFields();
      load();
    } catch (e: any) {
      message.error(e.response?.data?.error || '操作失败');
    }
  };

  const handleDeleteModule = async (mid: string) => {
    try {
      await moduleApi.remove(mid);
      message.success('模块已删除');
      load();
    } catch (e: any) {
      message.error(e.response?.data?.error || '删除失败');
    }
  };

  const handleCreateEndpoint = async (values: any) => {
    try {
      let params: Parameter[] = [];
      try {
        params = values.parameters ? JSON.parse(values.parameters) : [];
      } catch {
        params = [];
      }
      let requestBody: any = null;
      try {
        requestBody = values.request_body ? JSON.parse(values.request_body) : null;
      } catch {
        requestBody = null;
      }
      let responseSchema: any = null;
      try {
        responseSchema = values.response_schema ? JSON.parse(values.response_schema) : null;
      } catch {
        responseSchema = null;
      }

      const payload = {
        ...values,
        parameters: params,
        request_body: requestBody,
        response_schema: responseSchema,
        request_examples: values.request_example ? { default: JSON.parse(values.request_example) } : {},
        response_examples: values.response_example ? { default: JSON.parse(values.response_example) } : {},
      };

      if (editingEndpoint) {
        await endpointApi.update(editingEndpoint.id, payload);
      } else {
        await endpointApi.create(currentModuleId, payload);
      }
      message.success(editingEndpoint ? '接口已更新' : '接口已创建');
      setEndpointModalOpen(false);
      setEditingEndpoint(null);
      endpointForm.resetFields();
      load();
    } catch (e: any) {
      message.error(e.response?.data?.error || '操作失败，请检查JSON格式');
    }
  };

  const handleDeleteEndpoint = async (eid: string) => {
    try {
      await endpointApi.remove(eid);
      message.success('接口已删除');
      load();
    } catch (e: any) {
      message.error(e.response?.data?.error || '删除失败');
    }
  };

  const openCreateEndpoint = (mid: string) => {
    setCurrentModuleId(mid);
    setEditingEndpoint(null);
    endpointForm.resetFields();
    endpointForm.setFieldsValue({ method: 'GET' });
    setEndpointModalOpen(true);
  };

  const openEditEndpoint = (ep: Endpoint) => {
    setEditingEndpoint(ep);
    endpointForm.setFieldsValue({
      name: ep.name,
      description: ep.description,
      method: ep.method,
      path: ep.path,
      parameters: JSON.stringify(ep.parameters || [], null, 2),
      request_body: ep.request_body ? JSON.stringify(ep.request_body, null, 2) : '',
      response_schema: ep.response_schema ? JSON.stringify(ep.response_schema, null, 2) : '',
      request_example: ep.request_examples?.default ? JSON.stringify(ep.request_examples.default, null, 2) : '',
      response_example: ep.response_examples?.default ? JSON.stringify(ep.response_examples.default, null, 2) : '',
    });
    setEndpointModalOpen(true);
  };

  const openComments = async (type: string, targetId: string, name: string) => {
    setCommentTarget({ type, id: targetId, name });
    const list = await commentApi.list(id!);
    setComments(list.filter((c) => c.target_type === type && c.target_id === targetId));
    setCommentModalOpen(true);
  };

  const sendComment = async () => {
    if (!commentTarget || !newComment.trim()) return;
    try {
      await commentApi.create(id!, {
        target_type: commentTarget.type,
        target_id: commentTarget.id,
        content: newComment,
      });
      message.success('评论已发送');
      setNewComment('');
      const list = await commentApi.list(id!);
      setComments(list.filter((c) => c.target_type === commentTarget.type && c.target_id === commentTarget.id));
    } catch (e: any) {
      message.error(e.response?.data?.error || '发送失败');
    }
  };

  const saveSettings = async (values: any) => {
    try {
      await docApi.update(id!, values);
      await saveDocVersion('更新文档设置');
      message.success('设置已保存');
      setSettingsOpen(false);
      load();
    } catch (e: any) {
      message.error(e.response?.data?.error || '保存失败');
    }
  };

  const loadVersions = async () => {
    const v = await versionApi.list(id!);
    setVersions(v);
    setVersionOpen(true);
  };

  const loadChangelogs = async () => {
    const logs = await versionApi.changelogList(id!);
    setChangelogs(logs);
    setChangelogOpen(true);
  };

  const handleSubscribe = async () => {
    if (!subscribeEmail) {
      message.error('请输入邮箱');
      return;
    }
    try {
      await versionApi.subscribe(id!, subscribeEmail);
      message.success('订阅成功，文档更新时将收到通知');
      setSubscribeEmail('');
    } catch (e: any) {
      message.error(e.response?.data?.error || '订阅失败');
    }
  };

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
        label: (
          <Space style={{ width: '100%', justifyContent: 'space-between' }}>
            <span>📁 {m.name}</span>
            <Space size={0}>
              <Tooltip title="添加接口">
                <Button type="text" size="small" icon={<PlusOutlined />} onClick={(e) => { e.stopPropagation(); openCreateEndpoint(m.id); }} />
              </Tooltip>
              <Tooltip title="编辑模块">
                <Button type="text" size="small" icon={<EditOutlined />} onClick={(e) => { e.stopPropagation(); setEditingModule(m); moduleForm.setFieldsValue(m); setModuleModalOpen(true); }} />
              </Tooltip>
            </Space>
          </Space>
        ),
        children,
      });
    });
    return items;
  }, [modules, endpoints]);

  if (loading || !doc) {
    return <div style={{ padding: 24 }}>加载中...</div>;
  }

  const renderOverview = () => (
    <div>
      <Space align="center" style={{ marginBottom: 16 }}>
        <Title level={2} style={{ margin: 0 }}>{doc.title}</Title>
        <Tag color={doc.visibility === 'public' ? 'green' : doc.visibility === 'internal' ? 'blue' : 'default'}>
          {doc.visibility === 'public' ? '公开' : doc.visibility === 'internal' ? '内部' : '私有'}
        </Tag>
      </Space>
      <Paragraph style={{ fontSize: 15 }}>{doc.description || '暂无描述'}</Paragraph>
      {doc.base_url && (
        <Paragraph>
          <Text strong>基础 URL：</Text>
          <Text code>{doc.base_url}</Text>
        </Paragraph>
      )}
      <Divider />
      <Title level={3}>接口列表</Title>
      {modules.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 48, color: '#999' }}>
          <Paragraph>还没有任何模块，点击左侧「+ 新建模块」开始</Paragraph>
        </div>
      ) : (
        modules.map((m) => (
          <div key={m.id} style={{ marginBottom: 32 }}>
            <Title level={4} style={{ marginTop: 24 }}>
              {m.name}
              <Button type="link" size="small" icon={<CommentOutlined />} onClick={() => openComments('module', m.id, m.name)}>
                评论
              </Button>
            </Title>
            {m.description && <Paragraph type="secondary">{m.description}</Paragraph>}
            <List
              dataSource={endpoints.filter((e) => e.module_id === m.id)}
              renderItem={(ep) => (
                <List.Item
                  actions={[
                    <a key="view" onClick={() => setActiveKey(`ep-${ep.id}`)}>查看</a>,
                  ]}
                >
                  <List.Item.Meta
                    avatar={<span className={`http-method http-${ep.method}`}>{ep.method}</span>}
                    title={ep.name}
                    description={<Text code>{ep.path}</Text>}
                  />
                </List.Item>
              )}
              locale={{ emptyText: '暂无接口' }}
            />
          </div>
        ))
      )}
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
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEditEndpoint(ep)}>编辑</Button>
          <Button type="link" size="small" danger icon={<DeleteOutlined />} onClick={() => handleDeleteEndpoint(ep.id)}>删除</Button>
          <Button type="link" size="small" icon={<CommentOutlined />} onClick={() => openComments('endpoint', ep.id, ep.name)}>评论</Button>
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
              children: (
                <div>
                  {ep.response_examples?.default ? (
                    <pre className="code-block">{JSON.stringify(ep.response_examples.default, null, 2)}</pre>
                  ) : (
                    <Paragraph type="secondary">暂无响应示例</Paragraph>
                  )}
                </div>
              ),
            },
          ]}
        />
      </div>
    );
  };

  let content;
  if (activeKey === 'overview') {
    content = renderOverview();
  } else if (activeKey.startsWith('ep-')) {
    content = renderEndpoint(activeKey.replace('ep-', ''));
  }

  return (
    <Layout style={{ background: '#fff', borderRadius: 8 }}>
      <Sider
        width={280}
        theme="light"
        style={{ borderRight: '1px solid #f0f0f0', padding: 16, height: 'calc(100vh - 112px)', overflowY: 'auto' }}
      >
        <div style={{ marginBottom: 12 }}>
          <Button type="primary" icon={<PlusOutlined />} block onClick={() => { setEditingModule(null); moduleForm.resetFields(); setModuleModalOpen(true); }}>
            新建模块
          </Button>
        </div>
        <Tabs
          tabPosition="left"
          activeKey={activeKey}
          onChange={setActiveKey}
          items={menuItems}
          style={{ height: '100%' }}
        />
      </Sider>
      <Content style={{ padding: 32, height: 'calc(100vh - 112px)', overflowY: 'auto' }}>
        <div style={{ position: 'sticky', top: -32, background: '#fff', zIndex: 10, paddingTop: 32, marginBottom: 16 }}>
          <Space style={{ position: 'absolute', right: 0, top: 32 }}>
            <Button icon={<HistoryOutlined />} onClick={loadVersions}>版本历史</Button>
            <Button icon={<CommentOutlined />} onClick={() => openComments('document', doc.id, doc.title)}>文档评论</Button>
            <Button icon={<GlobalOutlined />} onClick={loadChangelogs}>Changelog</Button>
            <Button icon={<ShareAltOutlined />} onClick={() => setShareOpen(true)}>发布/分享</Button>
            <Button type="primary" icon={<SettingOutlined />} onClick={() => { settingsForm.setFieldsValue(doc); setSettingsOpen(true); }}>
              文档设置
            </Button>
          </Space>
        </div>
        {content}
      </Content>

      <Modal title={editingModule ? '编辑模块' : '新建模块'} open={moduleModalOpen} onCancel={() => { setModuleModalOpen(false); setEditingModule(null); }} footer={null}>
        <Form form={moduleForm} layout="vertical" onFinish={handleCreateModule}>
          <Form.Item name="name" label="模块名称" rules={[{ required: true }]}>
            <Input placeholder="例如：用户管理" />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <TextArea rows={3} placeholder="模块说明" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" block>{editingModule ? '保存' : '创建'}</Button>
          </Form.Item>
        </Form>
        {editingModule && (
          <Button danger block onClick={() => handleDeleteModule(editingModule.id)}>删除此模块</Button>
        )}
      </Modal>

      <Modal title={editingEndpoint ? '编辑接口' : '新建接口'} open={endpointModalOpen} onCancel={() => { setEndpointModalOpen(false); setEditingEndpoint(null); }} footer={null} width={720}>
        <Form form={endpointForm} layout="vertical" onFinish={handleCreateEndpoint}>
          <Space style={{ width: '100%' }}>
            <Form.Item name="name" label="接口名称" rules={[{ required: true }]} style={{ flex: 1 }}>
              <Input placeholder="获取用户信息" />
            </Form.Item>
            <Form.Item name="method" label="请求方法" rules={[{ required: true }]}>
              <Select style={{ width: 120 }} options={['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].map((m) => ({ value: m, label: m }))} />
            </Form.Item>
          </Space>
          <Form.Item name="path" label="请求路径" rules={[{ required: true }]}>
            <Input placeholder="/api/v1/users/:id" />
          </Form.Item>
          <Form.Item name="description" label="接口描述">
            <TextArea rows={2} />
          </Form.Item>
          <Form.Item name="parameters" label="参数 (JSON数组)">
            <TextArea rows={4} placeholder={`[{"name": "id", "in": "path", "type": "integer", "required": true, "description": "用户ID"}]`} />
          </Form.Item>
          <Form.Item name="request_body" label="请求体 Schema (JSON)">
            <TextArea rows={3} placeholder='{"type": "object", "properties": {...}}' />
          </Form.Item>
          <Form.Item name="request_example" label="请求示例 (JSON)">
            <TextArea rows={3} placeholder='{"name": "张三"}' />
          </Form.Item>
          <Form.Item name="response_schema" label="响应 Schema (JSON)">
            <TextArea rows={3} placeholder='{"type": "object", "properties": {...}}' />
          </Form.Item>
          <Form.Item name="response_example" label="响应示例 (JSON)">
            <TextArea rows={4} placeholder='{"code": 0, "data": {...}}' />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" block>{editingEndpoint ? '保存' : '创建'}</Button>
          </Form.Item>
        </Form>
        {editingEndpoint && (
          <Button danger block onClick={() => handleDeleteEndpoint(editingEndpoint.id)}>删除此接口</Button>
        )}
      </Modal>

      <Modal
        title={`评论 - ${commentTarget?.name}`}
        open={commentModalOpen}
        onCancel={() => setCommentModalOpen(false)}
        footer={null}
        width={520}
      >
        <List
          dataSource={comments}
          locale={{ emptyText: '暂无评论' }}
          renderItem={(c) => (
            <List.Item>
              <List.Item.Meta
                avatar={<div style={{ width: 32, height: 32, borderRadius: '50%', background: '#1677ff', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{c.user?.name?.[0] || 'U'}</div>}
                title={<Space>{c.user?.name}<Text type="secondary" style={{ fontSize: 12 }}>{dayjs(c.created_at).format('YYYY-MM-DD HH:mm')}</Text></Space>}
                description={c.content}
              />
            </List.Item>
          )}
          style={{ marginBottom: 16, maxHeight: 320, overflowY: 'auto' }}
        />
        <Space.Compact style={{ width: '100%' }}>
          <TextArea value={newComment} onChange={(e) => setNewComment(e.target.value)} placeholder="输入评论..." rows={2} />
          <Button type="primary" icon={<SendOutlined />} onClick={sendComment}>发送</Button>
        </Space.Compact>
      </Modal>

      <Modal title="文档设置" open={settingsOpen} onCancel={() => setSettingsOpen(false)} footer={null}>
        <Form form={settingsForm} layout="vertical" onFinish={saveSettings}>
          <Form.Item name="title" label="文档名称" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <TextArea rows={3} />
          </Form.Item>
          <Form.Item name="base_url" label="基础 URL">
            <Input placeholder="https://api.example.com/v1" />
          </Form.Item>
          <Form.Item name="visibility" label="可见性">
            <Select options={[
              { value: 'private', label: '私有 - 仅创建者和协作者可见' },
              { value: 'internal', label: '内部 - 登录用户可见' },
              { value: 'public', label: '公开 - 发布为公开站点，所有人可见' },
            ]} />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" block>保存设置</Button>
          </Form.Item>
        </Form>
      </Modal>

      <Modal title="版本历史" open={versionOpen} onCancel={() => setVersionOpen(false)} footer={null} width={600}>
        <List
          dataSource={versions}
          locale={{ emptyText: '暂无版本记录' }}
          renderItem={(v) => (
            <List.Item>
              <List.Item.Meta
                title={<Space>v{v.version} <Text type="secondary" style={{ fontSize: 12 }}>{dayjs(v.created_at).format('YYYY-MM-DD HH:mm')}</Text></Space>}
                description={<Space>{v.user?.name}：{v.change_summary || '无说明'}</Space>}
              />
            </List.Item>
          )}
        />
      </Modal>

      <Modal title="Changelog 更新日志" open={changelogOpen} onCancel={() => setChangelogOpen(false)} footer={null} width={600}>
        <List
          dataSource={changelogs}
          locale={{ emptyText: '暂无更新日志' }}
          renderItem={(log) => (
            <List.Item>
              <List.Item.Meta
                title={<Space>v{log.version} <Text type="secondary" style={{ fontSize: 12 }}>{dayjs(log.created_at).format('YYYY-MM-DD HH:mm')}</Text></Space>}
                description={
                  <ul>
                    {Array.isArray(log.changes) ? log.changes.map((c: string, i: number) => <li key={i}>{c}</li>) : typeof log.changes === 'string' ? log.changes : ''}
                  </ul>
                }
              />
            </List.Item>
          )}
        />
        <Divider />
        <Title level={5}>添加 Changelog 条目</Title>
        <ChangelogForm docId={id!} onAdded={() => loadChangelogs()} />
      </Modal>

      <Modal title="发布与订阅" open={shareOpen} onCancel={() => setShareOpen(false)} footer={null} width={520}>
        <div style={{ marginBottom: 24 }}>
          <Title level={5}>公开访问链接</Title>
          {doc.visibility === 'public' ? (
            <div>
              <Input value={`${location.origin}/public/${doc.id}`} readOnly />
              <Paragraph type="secondary" style={{ marginTop: 8 }}>
                此文档已发布为公开站点，任何人都可通过以上链接访问
              </Paragraph>
            </div>
          ) : (
            <Paragraph type="secondary">当前文档未设为公开，请在「文档设置」中将可见性改为「公开」</Paragraph>
          )}
        </div>
        <Divider />
        <div>
          <Title level={5}>订阅更新通知</Title>
          <Paragraph type="secondary">订阅后，当文档内容更新时，您将收到邮件通知</Paragraph>
          <Space.Compact style={{ width: '100%' }}>
            <Input placeholder="输入您的邮箱" value={subscribeEmail} onChange={(e) => setSubscribeEmail(e.target.value)} />
            <Button type="primary" onClick={handleSubscribe}>订阅</Button>
          </Space.Compact>
        </div>
      </Modal>
    </Layout>
  );
}

function ChangelogForm({ docId, onAdded }: { docId: string; onAdded: () => void }) {
  const [form] = Form.useForm();
  const { message } = App.useApp();
  const [changes, setChanges] = useState<string[]>(['']);

  const submit = async (values: any) => {
    try {
      const cleanChanges = changes.filter((c) => c.trim());
      if (cleanChanges.length === 0) {
        message.error('请填写至少一条变更');
        return;
      }
      await versionApi.changelogCreate(docId, { version: values.version, changes: cleanChanges });
      message.success('已添加');
      setChanges(['']);
      form.resetFields();
      onAdded();
    } catch (e: any) {
      message.error(e.response?.data?.error || '失败');
    }
  };

  return (
    <Form form={form} layout="vertical" onFinish={submit}>
      <Form.Item name="version" label="版本号" rules={[{ required: true }]} initialValue="1.0.0">
        <Input placeholder="例如：1.0.0" />
      </Form.Item>
      <Form.Item label="变更内容" required>
        {changes.map((c, i) => (
          <Space key={i} style={{ display: 'flex', marginBottom: 8 }}>
            <Input value={c} onChange={(e) => { const nc = [...changes]; nc[i] = e.target.value; setChanges(nc); }} placeholder="变更说明" style={{ width: 360 }} />
            <Button icon={<DeleteOutlined />} onClick={() => setChanges(changes.filter((_, idx) => idx !== i))} disabled={changes.length === 1} />
          </Space>
        ))}
        <Button icon={<PlusOutlined />} onClick={() => setChanges([...changes, ''])}>添加</Button>
      </Form.Item>
      <Form.Item>
        <Button type="primary" htmlType="submit">提交 Changelog</Button>
      </Form.Item>
    </Form>
  );
}

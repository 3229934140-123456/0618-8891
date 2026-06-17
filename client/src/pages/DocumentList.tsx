import { useState, useEffect } from 'react';
import { Button, Card, List, Tag, Modal, Form, Input, Select, Empty, App, Popconfirm, Space, Typography } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, GlobalOutlined, LockOutlined, TeamOutlined, EyeOutlined, UploadOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { docApi, toolApi } from '../api';
import type { Document } from '../types';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

const visMap: Record<string, { label: string; icon: any; color: string }> = {
  public: { label: '公开', icon: <GlobalOutlined />, color: 'green' },
  internal: { label: '内部', icon: <TeamOutlined />, color: 'blue' },
  private: { label: '私有', icon: <LockOutlined />, color: 'default' },
};

export default function DocumentList() {
  const [docs, setDocs] = useState<Document[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Document | null>(null);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [form] = Form.useForm();
  const [importForm] = Form.useForm();
  const navigate = useNavigate();
  const { message } = App.useApp();

  const load = async () => {
    setLoading(true);
    try {
      const data = await docApi.list();
      setDocs(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleCreate = async (values: any) => {
    try {
      if (editing) {
        await docApi.update(editing.id, values);
        message.success('更新成功');
      } else {
        await docApi.create(values);
        message.success('创建成功');
      }
      setModalOpen(false);
      setEditing(null);
      form.resetFields();
      load();
    } catch (e: any) {
      message.error(e.response?.data?.error || '操作失败');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await docApi.remove(id);
      message.success('删除成功');
      load();
    } catch (e: any) {
      message.error(e.response?.data?.error || '删除失败');
    }
  };

  const handleImport = async (values: any) => {
    try {
      const doc = await docApi.create({ title: values.title });
      try {
        await toolApi.importOpenAPI(doc.id, values.spec);
        message.success('导入成功');
        setImportModalOpen(false);
        importForm.resetFields();
        load();
        navigate(`/doc/${doc.id}`);
      } catch (e: any) {
        await docApi.remove(doc.id);
        message.error(e.response?.data?.error || '导入失败');
      }
    } catch (e: any) {
      message.error(e.response?.data?.error || '创建文档失败');
    }
  };

  const openEdit = (doc: Document) => {
    setEditing(doc);
    form.setFieldsValue(doc);
    setModalOpen(true);
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <Title level={3} style={{ margin: 0 }}>我的文档</Title>
        <Space>
          <Button icon={<UploadOutlined />} onClick={() => setImportModalOpen(true)}>
            导入 OpenAPI
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditing(null); form.resetFields(); setModalOpen(true); }}>
            新建文档
          </Button>
        </Space>
      </div>

      <List
        grid={{ gutter: 16, xs: 1, sm: 2, md: 3, lg: 3, xl: 4 }}
        loading={loading}
        dataSource={docs}
        locale={{ emptyText: <Empty description="暂无文档，点击右上角新建" /> }}
        renderItem={(doc) => {
          const vis = visMap[doc.visibility];
          return (
            <List.Item>
              <Card
                hoverable
                onClick={() => navigate(`/doc/${doc.id}`)}
                actions={[
                  <EyeOutlined key="view" onClick={(e) => { e.stopPropagation(); navigate(`/doc/${doc.id}`); }} />,
                  <EditOutlined key="edit" onClick={(e) => { e.stopPropagation(); openEdit(doc); }} />,
                  <Popconfirm title="确定删除？" onConfirm={(e) => { e?.stopPropagation(); handleDelete(doc.id); }}>
                    <DeleteOutlined key="delete" onClick={(e) => e.stopPropagation()} />
                  </Popconfirm>,
                ]}
              >
                <Card.Meta
                  title={
                    <Space>
                      <span>{doc.title}</span>
                      <Tag icon={vis.icon} color={vis.color}>{vis.label}</Tag>
                    </Space>
                  }
                  description={
                    <div>
                      <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
                        {doc.description || '暂无描述'}
                      </Text>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        更新于 {dayjs(doc.updated_at).format('YYYY-MM-DD HH:mm')}
                      </Text>
                    </div>
                  }
                />
              </Card>
            </List.Item>
          );
        }}
      />

      <Modal
        title={editing ? '编辑文档' : '新建文档'}
        open={modalOpen}
        onCancel={() => { setModalOpen(false); setEditing(null); form.resetFields(); }}
        footer={null}
      >
        <Form form={form} layout="vertical" onFinish={handleCreate}>
          <Form.Item name="title" label="文档名称" rules={[{ required: true }]}>
            <Input placeholder="例如：用户中心 API" />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={3} placeholder="简要描述文档用途" />
          </Form.Item>
          <Form.Item name="base_url" label="基础 URL">
            <Input placeholder="https://api.example.com/v1" />
          </Form.Item>
          <Form.Item name="visibility" label="可见性" initialValue="private">
            <Select
              options={[
                { value: 'private', label: '私有 - 仅创建者和协作者可见' },
                { value: 'internal', label: '内部 - 登录用户可见' },
                { value: 'public', label: '公开 - 所有人可见' },
              ]}
            />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" block>
              {editing ? '保存修改' : '创建文档'}
            </Button>
          </Form.Item>
        </Form>
      </Modal>

      <Modal title="从 OpenAPI 规范导入" open={importModalOpen} onCancel={() => setImportModalOpen(false)} footer={null}>
        <Form form={importForm} layout="vertical" onFinish={handleImport}>
          <Form.Item name="title" label="文档名称" rules={[{ required: true }]}>
            <Input placeholder="例如：PetStore API" />
          </Form.Item>
          <Form.Item name="spec" label="OpenAPI 规范 (JSON/YAML)" rules={[{ required: true }]}>
            <Input.TextArea rows={10} placeholder='{"openapi": "3.0.0", ...}' />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" block>
              导入
            </Button>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

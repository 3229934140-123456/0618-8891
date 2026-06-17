import { Form, Input, Button, Card, Typography, App } from 'antd';
import { Link, useNavigate } from 'react-router-dom';
import { authApi } from '../api';
import { useAuth } from '../store';

const { Title, Text } = Typography;

export default function Login() {
  const { setAuth } = useAuth();
  const navigate = useNavigate();
  const { message } = App.useApp();

  const onFinish = async (values: any) => {
    try {
      const res = await authApi.login(values);
      setAuth(res.token, res.user);
      message.success('登录成功');
      navigate('/');
    } catch (e: any) {
      message.error(e.response?.data?.error || '登录失败');
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f0f2f5' }}>
      <Card style={{ width: 400 }}>
        <Title level={3} style={{ textAlign: 'center', marginBottom: 32 }}>
          登录 API文档平台
        </Title>
        <Form layout="vertical" onFinish={onFinish}>
          <Form.Item name="email" label="邮箱" rules={[{ required: true, type: 'email' }]}>
            <Input size="large" placeholder="请输入邮箱" />
          </Form.Item>
          <Form.Item name="password" label="密码" rules={[{ required: true, min: 6 }]}>
            <Input.Password size="large" placeholder="请输入密码" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" size="large" htmlType="submit" block>
              登录
            </Button>
          </Form.Item>
        </Form>
        <div style={{ textAlign: 'center' }}>
          <Text>
            还没有账号？ <Link to="/register">去注册</Link>
          </Text>
        </div>
      </Card>
    </div>
  );
}

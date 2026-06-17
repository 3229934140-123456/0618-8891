import { Layout as AntLayout, Menu, Dropdown, Avatar } from 'antd';
import { Outlet, useNavigate, Link } from 'react-router-dom';
import { BookOutlined, UserOutlined, LogoutOutlined } from '@ant-design/icons';
import { useAuth } from '../store';

const { Header, Content } = AntLayout;

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <AntLayout style={{ minHeight: '100vh' }}>
      <Header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: '#001529',
          padding: '0 24px',
        }}
      >
        <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#fff', fontSize: 18, fontWeight: 600 }}>
          <BookOutlined />
          API文档平台
        </Link>
        <Dropdown
          menu={{
            items: [
              { key: 'info', label: user?.email, icon: <UserOutlined />, disabled: true },
              { type: 'divider' },
              {
                key: 'logout',
                label: '退出登录',
                icon: <LogoutOutlined />,
                onClick: () => {
                  logout();
                  navigate('/login');
                },
              },
            ],
          }}
        >
          <div style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Avatar style={{ backgroundColor: '#1677ff' }} icon={<UserOutlined />} />
            <span style={{ color: '#fff' }}>{user?.name}</span>
          </div>
        </Dropdown>
      </Header>
      <Content style={{ padding: 24 }}>
        <Outlet />
      </Content>
    </AntLayout>
  );
}

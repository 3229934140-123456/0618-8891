import { useState } from 'react';
import { Segmented, Button, Space, App } from 'antd';
import { CopyOutlined } from '@ant-design/icons';
import type { Endpoint } from '../types';
import { generateCode } from '../codeGen';

interface Props {
  endpoint: Endpoint;
  baseUrl?: string;
}

const languages = [
  { label: 'cURL', value: 'curl' },
  { label: 'Python', value: 'python' },
  { label: 'JavaScript', value: 'javascript' },
];

export default function CodeSamples({ endpoint, baseUrl = '' }: Props) {
  const [lang, setLang] = useState('curl');
  const { message } = App.useApp();

  const code = generateCode(lang, endpoint, baseUrl);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      message.success('已复制到剪贴板');
    } catch {
      message.error('复制失败');
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <Segmented options={languages} value={lang} onChange={setLang as any} />
        <Button icon={<CopyOutlined />} onClick={copy}>
          复制代码
        </Button>
      </div>
      <pre className="code-block" style={{ minHeight: 200 }}>
        {code}
      </pre>
    </div>
  );
}

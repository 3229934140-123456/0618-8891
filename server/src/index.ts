import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { initDatabase } from './db';
import authRoutes from './routes/auth';
import documentRoutes from './routes/documents';
import moduleRoutes from './routes/modules';
import endpointRoutes from './routes/endpoints';
import commentRoutes from './routes/comments';
import versionRoutes from './routes/versions';
import apiRoutes from './routes/api';

const app = express();
const PORT = process.env.PORT || 3001;

initDatabase();

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.use('/api/auth', authRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/documents', moduleRoutes);
app.use('/api', endpointRoutes);
app.use('/api/documents', commentRoutes);
app.use('/api/documents', versionRoutes);
app.use('/api', apiRoutes);

const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`API文档平台服务已启动: http://localhost:${PORT}`);
});

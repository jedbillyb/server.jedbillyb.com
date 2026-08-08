import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import systemRoutes from './routes/system.js';
import servicesRoutes from './routes/services.js';
import processesRoutes from './routes/processes.js';
import dockerRoutes from './routes/docker.js';
import logsRoutes from './routes/logs.js';
import activityRoutes from './routes/activity.js';
import projectsRoutes from './routes/projects.js';
import statusRoutes from './routes/status.js';
import streamRoutes from './routes/stream.js';
import { startIncidentMonitor } from './utils/incident.js';

const app = express();
const PORT = process.env.PORT || 4001;

app.use(cors());
app.use(express.json());

app.use('/api/system', systemRoutes);
app.use('/api/services', servicesRoutes);
app.use('/api/processes', processesRoutes);
app.use('/api/docker', dockerRoutes);
app.use('/api/logs', logsRoutes);
app.use('/api/activity', activityRoutes);
app.use('/api/projects', projectsRoutes);
app.use('/api/status', statusRoutes);
app.use('/api/stream', streamRoutes);

app.listen(PORT, '127.0.0.1', () => {
  console.log(`server-api running on :${PORT}`);
  // records outages even when nobody has the page open
  startIncidentMonitor().catch(err => console.error('incident monitor:', err.message));
});

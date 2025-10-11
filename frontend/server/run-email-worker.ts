import 'dotenv/config';
import { emailWorker } from './workers/emailWorker';

console.log('Starting the dedicated email worker process...');
emailWorker.start();
import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

app.get('/', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    message: 'UberLite Backend running',
  });
});

app.listen(PORT, () => {
  console.log(`UberLite backend server running on http://localhost:${PORT}`);
});

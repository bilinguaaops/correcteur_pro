interface ApiRequest {
  method?: string;
  body?: any;
  query?: Record<string, any>;
}

interface ApiResponse {
  status: (code: number) => ApiResponse;
  json: (data: any) => void;
  send: (data: any) => void;
}

export default function handler(req: ApiRequest, res: ApiResponse) {
  res.status(200).json({
    status: 'ok',
    hasKey: Boolean(process.env.GEMINI_API_KEY),
    timestamp: new Date().toISOString(),
  });
}

import axios from 'axios';

const baseURL = import.meta.env.VITE_API_URL ||
  (window.location.hostname === 'localhost' ? 'http://localhost:8002' : '');

const api = axios.create({ baseURL });

// 백엔드 아직 안 뜬 경우 자동 재시도 (최대 5회, 2초 간격)
api.interceptors.response.use(null, async (error) => {
  const config = error.config
  if (!config || config.__retryCount >= 5) return Promise.reject(error)
  const isNetworkError = !error.response
  if (!isNetworkError) return Promise.reject(error)
  config.__retryCount = (config.__retryCount || 0) + 1
  await new Promise(r => setTimeout(r, 2000))
  return api(config)
})

export default api;

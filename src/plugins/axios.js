import axios from "axios";

const apiClient = axios.create({
  baseURL: window.API_URL + "/rest/v1/" || "http://localhost:3000/api", // Backend API URL
  timeout: 10000, // Request timeout in milliseconds
  headers: {
    "Content-Type": "application/json", // Default header for JSON content
    Accept: "application/json",
  },
});

// Request interceptor
apiClient.interceptors.request.use(
  (config) => {
    // Add Authorization header if token is available
    const token = localStorage.getItem("auth_token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    // Handle request errors
    return Promise.reject(error);
  }
);

// Response interceptor
apiClient.interceptors.response.use(
  (response) => {
    // Directly return response data
    return response.data;
  },
  (error) => {
    // Handle API errors globally
    console.error("API Error:", error.response || error.message);
    if (error.response) {
      const { status } = error.response;
      if (status === 401) {
        // Handle Unauthorized (e.g., redirect to login)
        window.location.href = "/login";
      }
      if (status === 403) {
        console.error("Access Denied: You do not have permission.");
      }
    }
    return Promise.reject(error);
  }
);

export default apiClient;

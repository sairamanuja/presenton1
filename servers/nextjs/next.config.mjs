
const nextConfig = {
  reactStrictMode: false,
  distDir: ".next-build",
  output: "standalone",

  // Rewrites for development - proxy requests to FastAPI backend
  async rewrites() {
    // Use INTERNAL_API_URL for server-side Docker communication
    // Falls back to localhost for local development
    const backendUrl = process.env.INTERNAL_API_URL || 'http://localhost:8000';
    
    return [
      {
        source: '/app_data/fonts/:path*',
        destination: `${backendUrl}/app_data/fonts/:path*`,
      },
      {
        source: '/app_data/images/:path*',
        destination: `${backendUrl}/app_data/images/:path*`,
      },
      {
        source: '/api/v1/:path*',
        destination: `${backendUrl}/api/v1/:path*`,
      },
    ];
  },

  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "pub-7c765f3726084c52bcd5d180d51f1255.r2.dev",
      },
      {
        protocol: "https",
        hostname: "pptgen-public.ap-south-1.amazonaws.com",
      },
      {
        protocol: "https",
        hostname: "pptgen-public.s3.ap-south-1.amazonaws.com",
      },
      {
        protocol: "https",
        hostname: "storage.googleapis.com",
      },
      {
        protocol: "https",
        hostname: "img.icons8.com",
      },
      {
        protocol: "https",
        hostname: "present-for-me.s3.amazonaws.com",
      },
      {
        protocol: "https",
        hostname: "yefhrkuqbjcblofdcpnr.supabase.co",
      },
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      {
        protocol: "https",
        hostname: "picsum.photos",
      },
      {
        protocol: "https",
        hostname: "unsplash.com",
      },
    ],
  },
  
};

export default nextConfig;

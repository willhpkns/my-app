/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    env: {
      SECRET_PASSPHRASE: process.env.SECRET_PASSPHRASE,
    },
  }
  
export default nextConfig
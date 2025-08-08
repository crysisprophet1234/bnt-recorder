/** @type {import('next').NextConfig} */

const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  images: {
    domains: ['exemplo.com'],
  },
  // outras configs aqui
}

module.exports = nextConfig
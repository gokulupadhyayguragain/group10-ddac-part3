/** @type {import('next').NextConfig} */
const staticExport = process.env.SAFETRACE_STATIC_EXPORT === 'true';

const nextConfig = {
	reactStrictMode: true,
	images: { unoptimized: true },
	output: staticExport ? 'export' : 'standalone',
	trailingSlash: staticExport,
};
module.exports = nextConfig;

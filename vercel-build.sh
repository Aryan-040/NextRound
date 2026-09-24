#!/bin/bash
# Build script for Vercel deployment

echo "Building shared package..."
cd packages/shared
npm run build
cd ../..

echo "Building frontend..."
cd frontend
npm run build
cd ..

echo "Build complete!"

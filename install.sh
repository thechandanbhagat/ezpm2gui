#!/bin/bash

echo "Installing client dependencies..."
cd src/client
npm install

echo "Building client..."
npm run build

echo "Installing server dependencies..."
cd ../..
npm install

echo "Building server..."
npm run build

echo ""
echo "======================================"
echo "Installation complete!"
echo ""
echo "To start the application, run:"
echo "npm start"
echo "======================================="

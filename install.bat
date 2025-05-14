@echo off
echo Installing client dependencies...
cd src\client
call npm install

echo Building client...
call npm run build

echo Installing server dependencies...
cd ..\..
call npm install

echo Building server...
call npm run build

echo.
echo ======================================
echo Installation complete!
echo.
echo To start the application, run:
echo npm start
echo ======================================

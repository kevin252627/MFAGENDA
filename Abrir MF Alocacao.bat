@echo off
set "APP_FILE=C:\Users\Kevin Redigueri\Desktop\NOVO APP MF\dist\index.html"
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" start "" "%ProgramFiles%\Google\Chrome\Application\chrome.exe" "%APP_FILE%"
if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" start "" "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" "%APP_FILE%"
if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" start "" "%LocalAppData%\Google\Chrome\Application\chrome.exe" "%APP_FILE%"
if not exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" if not exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" if not exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" start "" "%APP_FILE%"

import { exec } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';

const testSetup = async () => {
  console.log('Testing setup...');
  
  // Test directories
  console.log('Checking directories...');
  try {
    await fs.access('audios');
    console.log('✓ audios directory exists');
  } catch {
    console.error('✗ audios directory missing');
  }
  
  try {
    await fs.access('bin');
    console.log('✓ bin directory exists');
  } catch {
    console.error('✗ bin directory missing');
  }
  
  // Test ffmpeg
  console.log('\nTesting ffmpeg...');
  try {
    const ffmpegResult = await new Promise((resolve, reject) => {
      exec('ffmpeg -version', (error, stdout) => {
        if (error) reject(error);
        resolve(stdout);
      });
    });
    console.log('✓ ffmpeg is accessible');
  } catch {
    console.error('✗ ffmpeg not found in PATH');
  }
  
  // Test rhubarb
  console.log('\nTesting rhubarb...');
  try {
    await fs.access(path.join('bin', 'rhubarb.exe'));
    console.log('✓ rhubarb.exe exists in bin directory');
  } catch {
    console.error('✗ rhubarb.exe missing from bin directory');
  }
};

testSetup().catch(console.error); 
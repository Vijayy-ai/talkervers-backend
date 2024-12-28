import { exec } from "child_process";
import cors from "cors";
import dotenv from "dotenv";
import voice from "elevenlabs-node";
import express from "express";
import { promises as fs } from "fs";
import axios from "axios"; // Added axios
import { CohereClient } from 'cohere-ai'; // Add this import
dotenv.config();

// Removed OpenAI import and initialization

const cohere = new CohereClient({
  token: process.env.COHERE_API_KEY || "5azvP5mzQgJB2rUqoThepBwWABu6h8Hpo5poJ1XH",
});

const elevenLabsApiKey = process.env.ELEVEN_LABS_API_KEY;
const voiceID = "1qEiC6qsybMkmnNdVMbK"; // Your valid voice ID

const app = express();
app.use(express.json());
app.use(cors());
const port = 3000;

const ensureDirectoriesExist = async () => {
  try {
    await fs.access('audios');
  } catch {
    await fs.mkdir('audios');
  }
  
  try {
    await fs.access('bin');
  } catch {
    await fs.mkdir('bin');
  }
};

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.get("/voices", async (req, res) => {
  res.send(await voice.getVoices(elevenLabsApiKey));
});

const execCommand = (command) => {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error('Command stderr:', stderr);
        reject(new Error(`${error.message}\nStderr: ${stderr}`));
        return;
      }
      resolve(stdout);
    });
  });
};

const lipSyncMessage = async (message) => {
  const time = new Date().getTime();
  try {
    console.log(`Starting conversion for message ${message}`);
    
    const basePath = process.cwd().replace(/\\/g, '/');
    const inputWav = `${basePath}/audios/message_${message}.wav`;
    const inputMp3 = `${basePath}/audios/message_${message}.mp3`;
    const outputJson = `${basePath}/audios/message_${message}.json`;
    
    // Use ffmpeg from PATH for audio conversion
    await execCommand(
      `ffmpeg -y -i "${inputMp3}" "${inputWav}"`
    );
    console.log(`Conversion done in ${new Date().getTime() - time}ms`);
    
    // Use local rhubarb for lip sync
    const rhubarbPath = `${basePath}/bin/rhubarb.exe`;
    
    // Verify rhubarb and its resources exist
    try {
      await fs.access(`${basePath}/bin/res/sphinx/acoustic-model/mdef`);
    } catch (error) {
      throw new Error('Rhubarb acoustic model files are missing. Please copy the complete res folder from Rhubarb distribution.');
    }
    
    const command = `"${rhubarbPath}" -f json -o "${outputJson}" "${inputWav}" -r phonetic`;
    console.log('Executing command:', command);
    
    await execCommand(command);
    console.log(`Lip sync done in ${new Date().getTime() - time}ms`);
  } catch (error) {
    console.error('Error in lipSyncMessage:', error);
    throw error;
  }
};

app.post("/chat", async (req, res) => {
  try {
    const userMessage = req.body.message;
    if (!userMessage) {
      res.send({
        messages: [
          {
            text: "Hey dear... How was your day?",
            audio: await audioFileToBase64("audios/intro_0.wav"),
            lipsync: await readJsonTranscript("audios/intro_0.json"),
            facialExpression: "smile",
            animation: "Talking_1",
          },
          {
            text: "it was well... Please tell me about your day too!",
            audio: await audioFileToBase64("audios/intro_1.wav"),
            lipsync: await readJsonTranscript("audios/intro_1.json"),
            facialExpression: "sad",
            animation: "Crying",
          },
        ],
      });
      return;
    }
    if (!elevenLabsApiKey) {
      res.send({
        messages: [
          {
            text: "Please my dear, don't forget to add your API keys!",
            audio: await audioFileToBase64("audios/api_0.wav"),
            lipsync: await readJsonTranscript("audios/api_0.json"),
            facialExpression: "angry",
            animation: "Angry",
          },
          {
            text: "You don't want to ruin Wawa Sensei with a crazy ChatGPT and ElevenLabs bill, right?",
            audio: await audioFileToBase64("audios/api_1.wav"),
            lipsync: await readJsonTranscript("audios/api_1.json"),
            facialExpression: "smile",
            animation: "Laughing",
          },
        ],
      });
      return;
    }

    // Replace Azure OpenAI call with Cohere
    const response = await cohere.generate({
      model: 'command',  // or another appropriate Cohere model
      prompt: `You are an empathetic assistant designed to engage users by detecting their emotional tone and mood through their input. Analyze each user's input to determine their emotional state—such as happiness, sadness, anger, or excitement—and respond with concise, emotionally appropriate replies that match the user's mood. Ensure your responses are brief, contextually relevant, and convey empathy, adapting your tone to align with the user's emotional state.

The response should be a JSON array of messages (maximum 3 messages).
Each message should have: text, facialExpression (smile/sad/angry/surprised/funnyFace/default), and animation (Talking_0/Talking_1/Talking_2/Crying/Laughing/Rumba/Idle/Terrified/Angry).

User message: ${userMessage}`,
      max_tokens: 300,
      temperature: 0.6,
      k: 0,
      stop_sequences: [],
      return_likelihoods: 'NONE'
    });

    let messages;
    try {
      // Parse the generated text as JSON
      messages = JSON.parse(response.generations[0].text);
      if (messages.messages) {
        messages = messages.messages;
      }
    } catch (error) {
      // Fallback in case the response isn't valid JSON
      messages = [{
        text: response.generations[0].text,
        facialExpression: "default",
        animation: "Talking_0"
      }];
    }

    for (let i = 0; i < messages.length; i++) {
      const message = messages[i];
      try {
        // generate audio file
        const fileName = `audios/message_${i}.mp3`;
        const textInput = message.text;
        await voice.textToSpeech(elevenLabsApiKey, voiceID, fileName, textInput);
        // generate lipsync
        await lipSyncMessage(i);
        message.audio = await audioFileToBase64(fileName);
        message.lipsync = await readJsonTranscript(`audios/message_${i}.json`);
      } catch (error) {
        console.error('Error processing audio:', error);
        // Fallback to no audio if there's an error
        message.audio = null;
        message.lipsync = null;
      }
    }

    res.send({ messages });
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).send({ 
      error: 'An error occurred processing your request',
      details: error.message 
    });
  }
});

const readJsonTranscript = async (file) => {
  const data = await fs.readFile(file, "utf8");
  return JSON.parse(data);
};

const audioFileToBase64 = async (file) => {
  const data = await fs.readFile(file);
  return data.toString("base64");
};

app.listen(port, async () => {
  await ensureDirectoriesExist();
  console.log(`Your virtual assistant listening on port ${port}`);
});

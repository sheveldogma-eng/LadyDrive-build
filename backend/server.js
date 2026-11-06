
import express from "express";
import OpenAI from "openai";
import crypto from "node:crypto";

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "32kb" }));

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const ACCESS_CODE = process.env.LADYDRIVE_ACCESS_CODE;

app.get("/", (req, res) => {
  res.json({
    app: "LadyDrive AI",
    status: "online"
  });
});

app.post("/chat", async (req, res) => {
  try {
    if (!ACCESS_CODE) {
      return res.status(503).json({
        error: "Server access is not configured"
      });
    }

    const supplied = req.get("x-access-code") || "";
    const a = Buffer.from(supplied);
    const b = Buffer.from(ACCESS_CODE);

    if (
      a.length !== b.length ||
      !crypto.timingSafeEqual(a, b)
    ) {
      return res.status(401).json({
        error: "Unauthorized"
      });
    }

    const { message, car, history } = req.body || {};

    if (
      typeof message !== "string" ||
      !message.trim() ||
      message.length > 2000
    ) {
      return res.status(400).json({
        error: "Invalid message"
      });
    }

    const safeCar =
      typeof car === "string"
        ? car.slice(0, 500)
        : JSON.stringify(car || {}).slice(0, 500);

    const safeHistory = Array.isArray(history)
      ? history.slice(-10)
          .filter(x =>
            x &&
            ["user", "assistant"].includes(x.role) &&
            typeof x.content === "string"
          )
          .map(x => ({
            role: x.role,
            content: x.content.slice(0, 2000)
          }))
      : [];

    const response = await openai.responses.create({
      model: "gpt-4.1-mini",
      instructions:
        "Ты LadyDrive, дружелюбный русскоязычный " +
        "автомобильный ИИ-помощник. " +
        "Помогай с диагностикой, обслуживанием " +
        "и ремонтом автомобиля. " +
        "Не выдавай предположения за точный диагноз. " +
        "При опасных неисправностях советуй " +
        "остановиться и обратиться к специалисту. " +
        "Данные автомобиля: " + safeCar,
      input: [
        ...safeHistory,
        { role: "user", content: message }
      ],
      max_output_tokens: 700,
      store: false
    });

    res.json({
      reply: response.output_text ||
        "Не удалось получить ответ."
    });
  } catch (error) {
    console.error("AI request failed:", error.status || error.message);
    res.status(500).json({
      error: "AI service unavailable"
    });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log("LadyDrive AI server started");
});

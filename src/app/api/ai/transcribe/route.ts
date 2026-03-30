import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

interface FormDataWithGet {
  get(name: string): FormDataEntryValue | null;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: "Missing OpenAI API key" }, { status: 500 });
    }

    const data = (await req.formData()) as unknown as FormDataWithGet;
    const file = data.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No audio file provided" }, { status: 400 });
    }

    // Call OpenAI Whisper API directly
    const openaiFormData = new FormData();
    const fileName = file.name || "audio.webm";
    openaiFormData.append("file", file, fileName);
    openaiFormData.append("model", "whisper-1");

    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: openaiFormData,
    });

    if (!res.ok) {
      const errorData = await res.json();
      console.error("OpenAI transcription error:", errorData);
      const upstreamMessage =
        typeof errorData?.error?.message === "string" ? errorData.error.message : "";
      const isInvalidApiKey = errorData?.error?.code === "invalid_api_key";

      return NextResponse.json(
        {
          error: isInvalidApiKey
            ? "The OpenAI API key is invalid. Update OPENAI_API_KEY in your environment settings."
            : upstreamMessage || "Transcription failed",
        },
        { status: res.status }
      );
    }

    const result = await res.json();
    return NextResponse.json({ text: result.text });
  } catch (err) {
    console.error("Transcribe API error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

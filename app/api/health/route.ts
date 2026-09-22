import { NextResponse } from "next/server";
import { db } from "@/src/prisma/db";

export async function GET() {
  try {
    const users = await db.orm.public.User.all();

    return NextResponse.json({
      success: true,
      database: "connected",
      userCount: users.length,
    });
  } catch (error) {
    console.error("Database connection failed:", error);

    return NextResponse.json(
      {
        success: false,
        database: "disconnected",
      },
      { status: 500 }
    );
  }
}
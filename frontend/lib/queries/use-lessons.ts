// lib/queries/use-lessons.ts
import { useQuery } from "@tanstack/react-query"

export interface Lesson {
  slug: string
  title: string
  titleHindi: string
  difficulty: "beginner" | "intermediate" | "self-directed"
  estimatedMinutes: number
}

async function fetchLessons(): Promise<Lesson[]> {
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/lessons`)
  if (!res.ok) {
    throw new Error(`Failed to fetch lessons: ${res.status}`)
  }
  return res.json()
}

export function useLessons() {
  return useQuery({
    queryKey: ["lessons"],
    queryFn: fetchLessons,
  })
}

import { NextRequest, NextResponse } from 'next/server'
import { getAllVariants, getVariantsByRecipe } from '@/lib/db'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const recipe_id = searchParams.get('recipe_id')

  if (recipe_id) {
    return NextResponse.json(getVariantsByRecipe(recipe_id))
  }
  return NextResponse.json(getAllVariants())
}

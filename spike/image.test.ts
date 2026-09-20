import { describe, it, beforeAll, afterAll, expect } from 'vitest'
import { Crepe, CrepeFeature } from '@milkdown/crepe'
import { parserCtx, serializerCtx } from '@milkdown/kit/core'

let crepe: Crepe
let root: HTMLElement
const trip = (md: string) => {
  let out = ''
  crepe.editor.action((ctx) => {
    out = ctx.get(serializerCtx)(ctx.get(parserCtx)(md)!)
  })
  return out.trim()
}

describe('image alt-text fidelity under Crepe', () => {
  describe('with ImageBlock enabled (Crepe default)', () => {
    beforeAll(async () => {
      root = document.createElement('div')
      document.body.appendChild(root)
      crepe = new Crepe({
        root,
        defaultValue: '',
        features: { [CrepeFeature.AI]: false, [CrepeFeature.TopBar]: false },
      })
      await crepe.create()
    }, 60_000)
    afterAll(async () => {
      await crepe?.destroy()
      root?.remove()
    })

    it('characterizes the damage', () => {
      const cases = [
        '![alt text](./img/pic.png)',
        '![](./img/pic.png)',
        '![a](p.png "Title")',
        'Inline ![alt here](p.png) inside a paragraph.',
        '![multi word alt](https://example.com/x.png)',
      ]
      for (const c of cases)
        console.log(`IMGBLOCK  ${JSON.stringify(c)}\n       -> ${JSON.stringify(trip(c))}`)
      expect(true).toBe(true)
    })
  })
})

describe('with ImageBlock disabled', () => {
  let c2: Crepe
  let r2: HTMLElement
  beforeAll(async () => {
    r2 = document.createElement('div')
    document.body.appendChild(r2)
    c2 = new Crepe({
      root: r2,
      defaultValue: '',
      features: {
        [CrepeFeature.AI]: false,
        [CrepeFeature.TopBar]: false,
        [CrepeFeature.ImageBlock]: false,
      },
    })
    await c2.create()
  }, 60_000)
  afterAll(async () => {
    await c2?.destroy()
    r2?.remove()
  })

  it('checks whether alt survives', () => {
    const t = (md: string) => {
      let o = ''
      c2.editor.action((ctx) => {
        o = ctx.get(serializerCtx)(ctx.get(parserCtx)(md)!)
      })
      return o.trim()
    }
    for (const c of ['![alt text](./img/pic.png)', 'Inline ![alt here](p.png) inside.']) {
      console.log(`NOIMGBLK  ${JSON.stringify(c)}\n       -> ${JSON.stringify(t(c))}`)
    }
    expect(true).toBe(true)
  })
})

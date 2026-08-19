import type { HeroBrandMarkOwnerProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { SidebarBrandMarkOwnerProps } from '@deepseek-ai/dsh-client-ui-sidebar/client'

type OfficialBrandMarkProps = HeroBrandMarkOwnerProps & SidebarBrandMarkOwnerProps

/**
 * Render the Eleven Views mark with the presentation requested by its host surface.
 * @param props - Host-supplied mark presentation.
 * @returns the transparent Eleven Views mark.
 */
export function OfficialBrandMark({ size, className }: OfficialBrandMarkProps) {
  return (
    <img
      src="/eleven-views-logo.png"
      width={size}
      height={(size * 180) / 220}
      className={className}
      alt=""
      aria-hidden="true"
    />
  )
}

/**
 * Render the Eleven Views name without its independently slotted mark.
 * @returns the Eleven Views name.
 */
export function OfficialBrandName() {
  return <span>ELEVEN VIEWS</span>
}

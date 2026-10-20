import type { HTMLAttributes, ReactNode } from 'react'

import { cn } from '@/lib/utils'

type CodeBlockFrameProps = Omit<HTMLAttributes<HTMLDivElement>, 'title'> & {
  bodyClassName?: string
  bodyMaxHeight?: string
  bodyOverlay?: ReactNode
  children: ReactNode
  endActions?: ReactNode
  showToolbar?: boolean
  title?: ReactNode
}

export const CodeBlockFrame = ({
  bodyClassName,
  bodyMaxHeight,
  bodyOverlay,
  children,
  className,
  endActions,
  showToolbar = false,
  title,
  ...props
}: CodeBlockFrameProps) => (
  <div
    className={cn(
      'group/code-block bg-muted/20 text-foreground my-3 w-full max-w-full overflow-hidden rounded-lg border shadow-xs',
      className
    )}
    {...props}
  >
    {showToolbar && (
      <div className='bg-muted/35 border-border/70 flex min-h-10 items-center gap-2 border-b px-2 py-1.5'>
        <div className='min-w-0 flex-1'>
          <div className='text-muted-foreground truncate font-mono text-[11px] font-medium tracking-wide uppercase'>
            {title}
          </div>
        </div>
        {endActions && (
          <div className='flex shrink-0 items-center gap-1'>{endActions}</div>
        )}
      </div>
    )}
    <div className='relative min-w-0'>
      <div
        className={cn(
          'code-block-scroll max-w-full overflow-auto transition-[max-height] duration-200 ease-out',
          bodyClassName
        )}
        style={{ maxHeight: bodyMaxHeight }}
      >
        {children}
      </div>
      {bodyOverlay}
    </div>
  </div>
)

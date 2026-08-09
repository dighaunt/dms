'use client';

import * as React from 'react';
import {
  motion,
  type HTMLMotionProps,
  type SVGMotionProps,
  type UseInViewOptions,
  type Variants,
} from 'motion/react';

const staticAnimations = {
  path: {
    initial: { pathLength: 1 },
    animate: {
      pathLength: [0.05, 1],
      transition: { duration: 0.8, ease: 'easeInOut' },
    },
  } as Variants,
  'path-loop': {
    initial: { pathLength: 1 },
    animate: {
      pathLength: [1, 0.05, 1],
      transition: { duration: 1.6, ease: 'easeInOut' },
    },
  } as Variants,
} as const;

type StaticAnimation = keyof typeof staticAnimations;
type Trigger<T extends string> = boolean | StaticAnimation | T;

type IconAnimationProps<T extends string = string> = {
  animate?: Trigger<T>;
  animateOnHover?: Trigger<T>;
  animateOnTap?: Trigger<T>;
  animateOnView?: Trigger<T>;
  animateOnViewMargin?: UseInViewOptions['margin'];
  animateOnViewOnce?: boolean;
  animation?: StaticAnimation | T;
};

type AnimateIconProps<T extends string = string> = Omit<
  HTMLMotionProps<'span'>,
  'animate'
> &
  IconAnimationProps<T> & {
    children: React.ReactNode;
  };

type IconProps<T extends string = string> = IconAnimationProps<T> &
  Omit<SVGMotionProps<SVGSVGElement>, 'animate'> & {
    size?: number;
  };

type IconWrapperProps<T extends string = string> = IconProps<T> & {
  icon: React.ComponentType<IconProps<T>>;
};

type AnimateIconContextValue = {
  controls: undefined;
  animation: string;
};

const AnimateIconContext = React.createContext<AnimateIconContextValue | null>(
  null,
);

function useAnimateIconContext(): AnimateIconContextValue {
  return React.useContext(AnimateIconContext) ?? {
    controls: undefined,
    animation: 'default',
  };
}

function activeVariant<T extends string>(
  trigger: Trigger<T> | undefined,
  fallback: string,
) {
  if (!trigger) return undefined;
  return typeof trigger === 'string' ? trigger : fallback;
}

function AnimateIcon<T extends string = string>({
  animate = false,
  animateOnHover = false,
  animateOnTap = false,
  animateOnView = false,
  animateOnViewMargin = '0px',
  animateOnViewOnce = true,
  animation,
  children,
  ...props
}: AnimateIconProps<T>) {
  const fallback = animation ?? 'default';
  const selectedAnimation =
    (typeof animate === 'string' && animate) ||
    (typeof animateOnHover === 'string' && animateOnHover) ||
    (typeof animateOnTap === 'string' && animateOnTap) ||
    (typeof animateOnView === 'string' && animateOnView) ||
    fallback;

  return (
    <AnimateIconContext.Provider
      value={{ controls: undefined, animation: selectedAnimation }}
    >
      <motion.span
        initial="initial"
        animate={activeVariant(animate, fallback)}
        whileHover={activeVariant(animateOnHover, fallback)}
        whileTap={activeVariant(animateOnTap, fallback)}
        whileInView={activeVariant(animateOnView, fallback)}
        viewport={{ once: animateOnViewOnce, margin: animateOnViewMargin }}
        {...props}
      >
        {children}
      </motion.span>
    </AnimateIconContext.Provider>
  );
}

function IconWrapper<T extends string>({
  size = 28,
  animation,
  animate,
  animateOnHover,
  animateOnTap,
  animateOnView,
  animateOnViewMargin,
  animateOnViewOnce,
  icon: IconComponent,
  ...props
}: IconWrapperProps<T>) {
  return (
    <AnimateIcon
      className="inline-flex shrink-0 align-middle leading-none"
      animation={animation}
      animate={animate}
      animateOnHover={animateOnHover}
      animateOnTap={animateOnTap}
      animateOnView={animateOnView}
      animateOnViewMargin={animateOnViewMargin}
      animateOnViewOnce={animateOnViewOnce}
    >
      <IconComponent size={size} {...props} />
    </AnimateIcon>
  );
}

function useIconVariants<
  V extends { default: T; [key: string]: T },
  T extends Record<string, Variants>,
>(animations: V): T {
  const { animation } = useAnimateIconContext();

  if (animation in staticAnimations) {
    const variant = staticAnimations[animation as StaticAnimation];
    return Object.fromEntries(
      Object.keys(animations.default).map((key) => [key, variant]),
    ) as T;
  }

  return animations[animation as keyof V] ?? animations.default;
}

export {
  staticAnimations,
  AnimateIcon,
  IconWrapper,
  useAnimateIconContext,
  useIconVariants,
  type IconProps,
  type IconWrapperProps,
  type AnimateIconProps,
  type AnimateIconContextValue,
};

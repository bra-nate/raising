interface BrandLogoProps {
  className?: string;
}

export function BrandLogo({ className }: BrandLogoProps) {
  return (
    <>
      <img src="/raising logo.png" alt="raising" className={`${className ?? ''} dark:hidden`} />
      <img src="/raising logo white.png" alt="raising" className={`${className ?? ''} hidden dark:block`} />
    </>
  );
}

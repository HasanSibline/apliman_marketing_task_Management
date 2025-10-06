import { Injectable, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    
    if (isPublic) {
      return true;
    }
    
    return super.canActivate(context);
  }

  handleRequest(err: any, user: any, info: any) {
    console.log('JWT Auth Guard - handleRequest called');
    console.log('Error:', err);
    console.log('User:', user);
    console.log('Info:', info);
    
    if (err || !user) {
      console.log('JWT Auth Guard - Authentication failed');
      throw err || new UnauthorizedException('Invalid or expired token');
    }
    
    console.log('JWT Auth Guard - Authentication successful');
    return user;
  }
}

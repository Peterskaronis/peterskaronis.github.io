class Particle {
    constructor(canvas) {
        this.canvas = canvas;
        this.x = Math.random() * canvas.width;
        this.y = Math.random() * canvas.height;
        this.size = Math.random() * 4 + 2;
        this.speedX = Math.random() * 1 - 0.5;
        this.speedY = Math.random() * 1 - 0.5;
        this.hue = Math.random() * 360;
        this.hueSpeed = Math.random() * 2 - 1;
    }

    update() {
        this.x += this.speedX;
        this.y += this.speedY;
        
        this.hue += this.hueSpeed;
        if (this.hue > 360) this.hue = 0;
        if (this.hue < 0) this.hue = 360;

        if (this.x > this.canvas.width) this.x = 0;
        if (this.x < 0) this.x = this.canvas.width;
        if (this.y > this.canvas.height) this.y = 0;
        if (this.y < 0) this.y = this.canvas.height;
    }

    draw(ctx) {
        const gradient = ctx.createRadialGradient(
            this.x, this.y, 0,
            this.x, this.y, this.size
        );
        
        gradient.addColorStop(0, `hsla(${this.hue}, 100%, 50%, 0.8)`);
        gradient.addColorStop(1, `hsla(${this.hue}, 100%, 50%, 0)`);
        
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
    }
}

function initParticles() {
    const canvas = document.getElementById('particleCanvas');
    const ctx = canvas.getContext('2d');
    let particles = [];
    const numberOfParticles = 75;

    function resizeCanvas() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }

    window.addEventListener('resize', () => {
        resizeCanvas();
        particles = [];
        for (let i = 0; i < numberOfParticles; i++) {
            particles.push(new Particle(canvas));
        }
    });

    resizeCanvas();

    for (let i = 0; i < numberOfParticles; i++) {
        particles.push(new Particle(canvas));
    }

    function animate() {
        ctx.fillStyle = 'rgba(245, 245, 245, 0.1)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        particles.forEach(particle => {
            particle.update();
            particle.draw(ctx);
        });

        particles.forEach((particle1, index) => {
            for (let j = index + 1; j < particles.length; j++) {
                const particle2 = particles[j];
                const dx = particle1.x - particle2.x;
                const dy = particle1.y - particle2.y;
                const distance = Math.sqrt(dx * dx + dy * dy);

                if (distance < 150) {
                    ctx.beginPath();
                    const gradient = ctx.createLinearGradient(
                        particle1.x, particle1.y,
                        particle2.x, particle2.y
                    );
                    gradient.addColorStop(0, `hsla(${particle1.hue}, 100%, 50%, ${0.2 * (1 - distance/150)})`);
                    gradient.addColorStop(1, `hsla(${particle2.hue}, 100%, 50%, ${0.2 * (1 - distance/150)})`);
                    ctx.strokeStyle = gradient;
                    ctx.lineWidth = 2 * (1 - distance/150);
                    ctx.moveTo(particle1.x, particle1.y);
                    ctx.lineTo(particle2.x, particle2.y);
                    ctx.stroke();
                }
            }
        });

        requestAnimationFrame(animate);
    }

    animate();
}

document.addEventListener('DOMContentLoaded', initParticles); 
document.addEventListener('DOMContentLoaded', function() {
    // Theme toggle functionality
    const themeToggle = document.getElementById('themeToggle');
    const prefersDarkScheme = window.matchMedia('(prefers-color-scheme: dark)');
    
    // Check if user has a saved preference
    const currentTheme = localStorage.getItem('theme') || 
                         (prefersDarkScheme.matches ? 'dark' : 'light');
    
    // Apply theme on initial load
    if (currentTheme === 'light') {
        document.body.classList.add('light-theme');
        themeToggle.innerHTML = '<i class="fas fa-sun"></i>';
    } else {
        document.body.classList.remove('light-theme');
        themeToggle.innerHTML = '<i class="fas fa-moon"></i>';
    }
    
    // Toggle theme on click
    themeToggle.addEventListener('click', function() {
        document.body.classList.toggle('light-theme');
        
        // Update icon
        if (document.body.classList.contains('light-theme')) {
            themeToggle.innerHTML = '<i class="fas fa-sun"></i>';
            localStorage.setItem('theme', 'light');
            
            // Update particles color for light theme
            if (window.pJSDom && window.pJSDom[0]) {
                window.pJSDom[0].pJS.particles.color.value = '#4f46e5';
                window.pJSDom[0].pJS.particles.line_linked.color = '#4f46e5';
                window.pJSDom[0].pJS.fn.particlesRefresh();
            }
        } else {
            themeToggle.innerHTML = '<i class="fas fa-moon"></i>';
            localStorage.setItem('theme', 'dark');
            
            // Update particles color for dark theme
            if (window.pJSDom && window.pJSDom[0]) {
                window.pJSDom[0].pJS.particles.color.value = '#ffffff';
                window.pJSDom[0].pJS.particles.line_linked.color = '#ffffff';
                window.pJSDom[0].pJS.fn.particlesRefresh();
            }
        }
    });
    
    // Back to top button functionality
    const backToTop = document.getElementById('backToTop');
    
    window.addEventListener('scroll', function() {
        if (window.pageYOffset > 300) {
            backToTop.classList.add('visible');
        } else {
            backToTop.classList.remove('visible');
        }
    });
    
    backToTop.addEventListener('click', function() {
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    });
    
    // Mobile menu functionality
    const mobileMenuBtn = document.querySelector('.mobile-menu-btn');
    let mobileNav = document.querySelector('.mobile-nav');
    
    // Create mobile nav if it doesn't exist
    if (!mobileNav) {
        mobileNav = document.createElement('div');
        mobileNav.className = 'mobile-nav';
        
        const mobileNavLinks = document.createElement('div');
        mobileNavLinks.className = 'mobile-nav-links';
        
        // Clone nav links for mobile
        const navLinks = document.querySelector('.nav-links');
        if (navLinks) {
            Array.from(navLinks.children).forEach(item => {
                const link = item.querySelector('a');
                if (link) {
                    const mobileLink = document.createElement('a');
                    mobileLink.href = link.href;
                    mobileLink.className = link.className.replace('nav-link', 'mobile-nav-link');
                    mobileLink.innerHTML = link.innerHTML;
                    mobileNavLinks.appendChild(mobileLink);
                }
            });
        }
        
        mobileNav.appendChild(mobileNavLinks);
        document.querySelector('header').appendChild(mobileNav);
    }
    
    if (mobileMenuBtn) {
        mobileMenuBtn.addEventListener('click', function() {
            this.classList.toggle('active');
            mobileNav.classList.toggle('active');
            
            // Animate hamburger menu
            const spans = this.querySelectorAll('span');
            if (this.classList.contains('active')) {
                spans[0].style.transform = 'rotate(45deg) translate(5px, 5px)';
                spans[1].style.opacity = '0';
                spans[2].style.transform = 'rotate(-45deg) translate(5px, -5px)';
            } else {
                spans[0].style.transform = 'none';
                spans[1].style.opacity = '1';
                spans[2].style.transform = 'none';
            }
        });
        
        // Close mobile menu when clicking on a link
        document.querySelectorAll('.mobile-nav-link').forEach(link => {
            link.addEventListener('click', function() {
                mobileMenuBtn.classList.remove('active');
                mobileNav.classList.remove('active');
                
                // Reset hamburger icon
                const spans = mobileMenuBtn.querySelectorAll('span');
                spans[0].style.transform = 'none';
                spans[1].style.opacity = '1';
                spans[2].style.transform = 'none';
            });
        });
    }
    
    // Feature tabs functionality
    const featureTabBtns = document.querySelectorAll('.feature-tab-btn');
    
    featureTabBtns.forEach(button => {
        button.addEventListener('click', function() {
            // Remove active class from all buttons
            featureTabBtns.forEach(btn => btn.classList.remove('active'));
            // Add active class to clicked button
            this.classList.add('active');
            
            // Get target tab pane
            const target = this.getAttribute('data-target');
            
            // Hide all tab panes
            document.querySelectorAll('.feature-tab-pane').forEach(pane => {
                pane.classList.remove('active');
            });
            
            // Show target tab pane
            document.getElementById(target).classList.add('active');
        });
    });
    
    // Installation tabs functionality
    const tabBtns = document.querySelectorAll('.tab-btn');
    
    tabBtns.forEach(button => {
        button.addEventListener('click', function() {
            // Remove active class from all buttons
            tabBtns.forEach(btn => btn.classList.remove('active'));
            // Add active class to clicked button
            this.classList.add('active');
            
            // Get target tab pane
            const target = this.getAttribute('data-target');
            
            // Hide all tab panes
            document.querySelectorAll('.tab-pane').forEach(pane => {
                pane.classList.remove('active');
            });
            
            // Show target tab pane
            document.getElementById(target).classList.add('active');
        });
    });
    
    // Screenshot slider functionality
    const screenshots = document.querySelectorAll('.screenshot');
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    let currentSlide = 0;
    
    if (screenshots.length > 0) {
        // Show first screenshot
        screenshots[currentSlide].classList.add('active');
        
        // Previous button click
        if (prevBtn) {
            prevBtn.addEventListener('click', function() {
                // Hide current slide
                screenshots[currentSlide].classList.remove('active');
                
                // Decrease index and wrap around if necessary
                currentSlide = (currentSlide - 1 + screenshots.length) % screenshots.length;
                
                // Show new slide
                screenshots[currentSlide].classList.add('active');
            });
        }
        
        // Next button click
        if (nextBtn) {
            nextBtn.addEventListener('click', function() {
                // Hide current slide
                screenshots[currentSlide].classList.remove('active');
                
                // Increase index and wrap around if necessary
                currentSlide = (currentSlide + 1) % screenshots.length;
                
                // Show new slide
                screenshots[currentSlide].classList.add('active');
            });
        }
        
        // Auto advance slides every 5 seconds
        setInterval(function() {
            if (document.visibilityState === 'visible') {
                // Only auto-advance if page is visible
                // Hide current slide
                screenshots[currentSlide].classList.remove('active');
                
                // Increase index and wrap around if necessary
                currentSlide = (currentSlide + 1) % screenshots.length;
                
                // Show new slide
                screenshots[currentSlide].classList.add('active');
            }
        }, 5000);
    }
    
    // Copy to clipboard functionality
    const copyButtons = document.querySelectorAll('.copy-btn');
    
    copyButtons.forEach(button => {
        button.addEventListener('click', function() {
            const codeText = this.getAttribute('data-code');
            
            // Create a temporary textarea element to copy the text
            const textarea = document.createElement('textarea');
            textarea.value = codeText;
            textarea.setAttribute('readonly', '');
            textarea.style.position = 'absolute';
            textarea.style.left = '-9999px';
            document.body.appendChild(textarea);
            
            // Select and copy the text
            textarea.select();
            document.execCommand('copy');
            
            // Remove the textarea
            document.body.removeChild(textarea);
            
            // Change the icon to indicate successful copy
            const icon = this.querySelector('i');
            icon.className = 'fas fa-check';
            
            // Revert back to copy icon after 2 seconds
            setTimeout(() => {
                icon.className = 'fas fa-copy';
            }, 2000);
        });
    });
    
    // Scroll animations for fade-in elements
    const fadeElements = document.querySelectorAll('.fade-in-element');
    
    function checkFadeElements() {
        const triggerBottom = window.innerHeight * 0.8;
        
        fadeElements.forEach(element => {
            const elementTop = element.getBoundingClientRect().top;
            
            if (elementTop < triggerBottom) {
                element.classList.add('visible');
            }
        });
    }
    
    // Check elements on initial load
    checkFadeElements();
    
    // Check elements on scroll
    window.addEventListener('scroll', checkFadeElements);
    
    // Smooth scrolling for anchor links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            e.preventDefault();
            
            const targetId = this.getAttribute('href');
            if (targetId === '#') return;
            
            const targetElement = document.querySelector(targetId);
            if (targetElement) {
                window.scrollTo({
                    top: targetElement.offsetTop - 80,
                    behavior: 'smooth'
                });
            }
        });
    });
    
    // Navbar appearance on scroll
    const header = document.querySelector('.glass-nav');
    
    window.addEventListener('scroll', function() {
        if (window.pageYOffset > 50) {
            header.style.padding = '0.5rem 0';
            header.style.boxShadow = 'var(--shadow-md)';
        } else {
            header.style.padding = '0.75rem 0';
            header.style.boxShadow = 'none';
        }
    });
});
